// Desktop duplication of the game's monitor, tone-mapped by a shader when it is HDR, scaled to NV12
// by the video processor and encoded by the GPU's own encoder. Packets go into the shared ring.
use std::mem::ManuallyDrop;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use aw_next_hdr_screenshot::display::{path_for_device, path_hdr_enabled, path_sdr_white_scale};
use aw_next_hdr_screenshot::tone::{HALF_INFINITY, PixelTables, rel_from_pq};
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Variant::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::*;

use crate::ring::{Packet, SECOND};
use crate::{Config, HdrMode, Shared, log, now};

const POOL: usize = 8;
const MONITOR_CHECK: Duration = Duration::from_secs(3);
// The encoder often asks for its next frame a few milliseconds after the tick; skipping the frame
// then left a visible hitch (16% of frames on an idle desktop).
const INPUT_WAIT: Duration = Duration::from_millis(12);
// Used when the display does not report its peak: a common HDR monitor and a safe tone-map target.
const DEFAULT_PEAK_NITS: f32 = 1000.0;

// The tone curve of the HDR screenshots, applied per pixel through the same lookup tables.
const SHADER: &str = r"
Texture2D<float4> desktop : register(t0);
StructuredBuffer<float2> tables : register(t1);

float4 vs(uint id : SV_VertexID) : SV_Position {
    float2 uv = float2((id << 1) & 2, id & 2);
    return float4(uv * float2(2, -2) + float2(-1, 1), 0, 1);
}

float encode(float v) {
    v = saturate(v);
    return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

float4 ps(float4 position : SV_Position) : SV_Target {
    float3 c = max(desktop.Load(int3(position.xy, 0)).rgb, 0.0);
    uint bits = min(f32tof16(max(c.r, max(c.g, c.b))), 0x7bffu);
    float2 t = tables[bits];
    float3 m = c * t.x;
    m += (max(m.r, max(m.g, m.b)) - m) * t.y;
    return float4(encode(m.r), encode(m.g), encode(m.b), 1.0);
}
";

fn pack(high: u32, low: u32) -> u64 {
    ((high as u64) << 32) | low as u64
}

fn variant_u32(value: u32) -> VARIANT {
    let mut variant = VARIANT::default();
    unsafe {
        (*variant.Anonymous.Anonymous).vt = VT_UI4;
        (*variant.Anonymous.Anonymous).Anonymous.ulVal = value;
    }
    variant
}

fn variant_bool(value: bool) -> VARIANT {
    let mut variant = VARIANT::default();
    unsafe {
        (*variant.Anonymous.Anonymous).vt = VT_BOOL;
        (*variant.Anonymous.Anonymous).Anonymous.boolVal = if value { VARIANT_TRUE } else { VARIANT_FALSE };
    }
    variant
}

struct WindowSearch {
    pid: u32,
    best: HWND,
    area: i64,
}

unsafe extern "system" fn visit_window(window: HWND, param: LPARAM) -> BOOL {
    unsafe {
        let search = &mut *(param.0 as *mut WindowSearch);
        let mut owner = 0u32;
        GetWindowThreadProcessId(window, Some(&mut owner));
        if owner == search.pid && IsWindowVisible(window).as_bool() && !IsIconic(window).as_bool() {
            let mut rect = RECT::default();
            if GetWindowRect(window, &mut rect).is_ok() {
                let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
                if area > search.area {
                    search.area = area;
                    search.best = window;
                }
            }
        }
        TRUE
    }
}

// The monitor showing the game's largest window, or the primary one while it has none.
fn game_monitor(pid: u32) -> HMONITOR {
    unsafe {
        if pid != 0 {
            let mut search = WindowSearch { pid, best: HWND::default(), area: 0 };
            let _ = EnumWindows(Some(visit_window), LPARAM(&mut search as *mut _ as isize));
            if search.area > 0 {
                return MonitorFromWindow(search.best, MONITOR_DEFAULTTOPRIMARY);
            }
        }
        MonitorFromPoint(POINT::default(), MONITOR_DEFAULTTOPRIMARY)
    }
}

fn output_for(monitor: HMONITOR) -> Result<(IDXGIAdapter1, IDXGIOutput)> {
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
        let mut fallback = None;
        let mut a = 0;
        while let Ok(adapter) = factory.EnumAdapters1(a) {
            let mut o = 0;
            while let Ok(output) = adapter.EnumOutputs(o) {
                let desc = output.GetDesc()?;
                if desc.Monitor == monitor {
                    return Ok((adapter, output));
                }
                if fallback.is_none() && desc.AttachedToDesktop.as_bool() {
                    fallback = Some((adapter.clone(), output));
                }
                o += 1;
            }
            a += 1;
        }
        fallback.ok_or_else(|| Error::new(E_FAIL, "no display output to capture"))
    }
}

fn compile(entry: &[u8], target: &[u8]) -> Result<Vec<u8>> {
    unsafe {
        let mut code = None;
        let mut errors = None;
        let result = D3DCompile(
            SHADER.as_ptr() as *const _,
            SHADER.len(),
            PCSTR::null(),
            None,
            None,
            PCSTR(entry.as_ptr()),
            PCSTR(target.as_ptr()),
            0,
            0,
            &mut code,
            Some(&mut errors),
        );
        if let Err(error) = result {
            let detail = errors
                .map(|blob: ID3DBlob| String::from_utf8_lossy(std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize())).to_string())
                .unwrap_or_default();
            return Err(Error::new(error.code(), format!("shader: {detail}")));
        }
        let code = code.unwrap();
        Ok(std::slice::from_raw_parts(code.GetBufferPointer() as *const u8, code.GetBufferSize()).to_vec())
    }
}

fn texture(device: &ID3D11Device, width: u32, height: u32, format: DXGI_FORMAT, bind: D3D11_BIND_FLAG) -> Result<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: format,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: bind.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let mut texture = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture))? };
    Ok(texture.unwrap())
}

// HDR desktop (scRGB FP16) -> SDR BGRA, through the screenshot helper's tone tables.
struct HdrPass {
    source: ID3D11Texture2D,
    source_view: ID3D11ShaderResourceView,
    tables: ID3D11ShaderResourceView,
    target: ID3D11RenderTargetView,
    vertex: ID3D11VertexShader,
    pixel: ID3D11PixelShader,
    viewport: D3D11_VIEWPORT,
}

impl HdrPass {
    fn new(device: &ID3D11Device, frame: &ID3D11Texture2D, width: u32, height: u32, scene_peak: f32, white_scale: f32) -> Result<Self> {
        unsafe {
            let source = texture(device, width, height, DXGI_FORMAT_R16G16B16A16_FLOAT, D3D11_BIND_SHADER_RESOURCE)?;
            let mut source_view = None;
            device.CreateShaderResourceView(&source, None, Some(&mut source_view))?;

            let tables = PixelTables::new(scene_peak, white_scale);
            let interleaved: Vec<f32> = (0..HALF_INFINITY as usize).flat_map(|i| [tables.scale[i], tables.blend[i]]).collect();
            let desc = D3D11_BUFFER_DESC {
                ByteWidth: (interleaved.len() * 4) as u32,
                Usage: D3D11_USAGE_IMMUTABLE,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: D3D11_RESOURCE_MISC_BUFFER_STRUCTURED.0 as u32,
                StructureByteStride: 8,
            };
            let data = D3D11_SUBRESOURCE_DATA { pSysMem: interleaved.as_ptr() as *const _, SysMemPitch: 0, SysMemSlicePitch: 0 };
            let mut buffer = None;
            device.CreateBuffer(&desc, Some(&data), Some(&mut buffer))?;
            let mut tables_view = None;
            device.CreateShaderResourceView(&buffer.unwrap(), None, Some(&mut tables_view))?;

            let mut target = None;
            device.CreateRenderTargetView(frame, None, Some(&mut target))?;
            let mut vertex = None;
            device.CreateVertexShader(&compile(b"vs\0", b"vs_5_0\0")?, None, Some(&mut vertex))?;
            let mut pixel = None;
            device.CreatePixelShader(&compile(b"ps\0", b"ps_5_0\0")?, None, Some(&mut pixel))?;
            Ok(Self {
                source,
                source_view: source_view.unwrap(),
                tables: tables_view.unwrap(),
                target: target.unwrap(),
                vertex: vertex.unwrap(),
                pixel: pixel.unwrap(),
                viewport: D3D11_VIEWPORT { TopLeftX: 0.0, TopLeftY: 0.0, Width: width as f32, Height: height as f32, MinDepth: 0.0, MaxDepth: 1.0 },
            })
        }
    }

    fn draw(&self, ctx: &ID3D11DeviceContext) {
        unsafe {
            ctx.OMSetRenderTargets(Some(&[Some(self.target.clone())]), None);
            ctx.RSSetViewports(Some(&[self.viewport]));
            ctx.IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            ctx.IASetInputLayout(None);
            ctx.VSSetShader(&self.vertex, None);
            ctx.PSSetShader(&self.pixel, None);
            ctx.PSSetShaderResources(0, Some(&[Some(self.source_view.clone()), Some(self.tables.clone())]));
            ctx.Draw(3, 0);
            ctx.PSSetShaderResources(0, Some(&[None, None]));
            ctx.OMSetRenderTargets(None, None);
        }
    }
}

struct Encoder {
    mft: IMFTransform,
    events: IMFMediaEventGenerator,
    provides_samples: bool,
    output_size: u32,
    need: u32,
    typed: bool,
}

// Bits per pixel of a 30 fps H.264 stream; 60 fps costs half as much again and HEVC or AV1 a third
// less. The Settings page estimates clip sizes with the same numbers (app/util/clipProfile.js).
fn bitrate(quality: &str, codec: &str, width: u32, height: u32, fps: u32) -> u32 {
    let bits_per_pixel = match quality {
        "low" => 0.08,
        "high" => 0.22,
        _ => 0.13,
    };
    let mut bits = width as f64 * height as f64 * 30.0 * bits_per_pixel;
    if fps > 30 {
        bits *= 1.5;
    }
    if codec != "h264" {
        bits *= 0.7;
    }
    bits.clamp(1_000_000.0, 150_000_000.0) as u32
}

fn codec_subtype(codec: &str) -> GUID {
    match codec {
        "hevc" => MFVideoFormat_HEVC,
        "av1" => MFVideoFormat_AV1,
        _ => MFVideoFormat_H264,
    }
}

fn find_encoder(luid: LUID, subtype: GUID) -> Result<Option<(IMFActivate, String)>> {
    unsafe {
        let attributes = {
            let mut attributes = None;
            MFCreateAttributes(&mut attributes, 1)?;
            attributes.unwrap()
        };
        let id = pack(luid.HighPart as u32, luid.LowPart);
        attributes.SetBlob(&MFT_ENUM_ADAPTER_LUID, &id.to_le_bytes())?;
        let input = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: MFVideoFormat_NV12 };
        let output = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Video, guidSubtype: subtype };
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        MFTEnum2(MFT_CATEGORY_VIDEO_ENCODER, MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER, Some(&input), Some(&output), &attributes, &mut list, &mut count)?;
        let found = std::slice::from_raw_parts(list, count as usize).iter().flatten().next().cloned();
        for item in std::slice::from_raw_parts_mut(list, count as usize) {
            drop(item.take());
        }
        if !list.is_null() {
            windows::Win32::System::Com::CoTaskMemFree(Some(list as *const _));
        }
        Ok(found.map(|activate| {
            let mut name = PWSTR::null();
            let mut length = 0;
            let label = if activate.GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut name, &mut length).is_ok() {
                let label = name.to_string().unwrap_or_default();
                windows::Win32::System::Com::CoTaskMemFree(Some(name.0 as *const _));
                label
            } else {
                "hardware encoder".to_string()
            };
            (activate, label)
        }))
    }
}

impl Encoder {
    fn new(manager: &IMFDXGIDeviceManager, activate: &IMFActivate, subtype: GUID, size: (u32, u32), fps: u32, bitrate: u32) -> Result<Self> {
        unsafe {
            let mft: IMFTransform = activate.ActivateObject()?;
            let attributes = mft.GetAttributes()?;
            attributes.SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)?;
            let _ = attributes.SetUINT32(&MF_LOW_LATENCY, 1);
            mft.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, manager.as_raw() as usize)?;

            let output = MFCreateMediaType()?;
            output.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            output.SetGUID(&MF_MT_SUBTYPE, &subtype)?;
            output.SetUINT32(&MF_MT_AVG_BITRATE, bitrate)?;
            output.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            output.SetUINT64(&MF_MT_FRAME_SIZE, pack(size.0, size.1))?;
            output.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
            output.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
            output.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)?;
            output.SetUINT32(&MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709.0 as u32)?;
            output.SetUINT32(&MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709.0 as u32)?;
            output.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235.0 as u32)?;
            if subtype == MFVideoFormat_H264 {
                output.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?;
            }
            mft.SetOutputType(0, &output, 0)?;

            let mut index = 0;
            loop {
                let input = mft.GetInputAvailableType(0, index)?;
                if input.GetGUID(&MF_MT_SUBTYPE)? == MFVideoFormat_NV12 {
                    input.SetUINT64(&MF_MT_FRAME_SIZE, pack(size.0, size.1))?;
                    input.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
                    input.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
                    mft.SetInputType(0, &input, 0)?;
                    break;
                }
                index += 1;
            }

            // CBR is the one mode every certified encoder supports; a keyframe a second lets a clip
            // start where asked, and without B-frames decode order is display order.
            let api: ICodecAPI = mft.cast()?;
            for (name, property, value) in [
                ("rate control", CODECAPI_AVEncCommonRateControlMode, variant_u32(eAVEncCommonRateControlMode_CBR.0 as u32)),
                ("bitrate", CODECAPI_AVEncCommonMeanBitRate, variant_u32(bitrate)),
                ("keyframe interval", CODECAPI_AVEncMPVGOPSize, variant_u32(fps)),
                ("low latency", CODECAPI_AVLowLatencyMode, variant_bool(true)),
            ] {
                if let Err(error) = api.SetValue(&property, &value) {
                    log(&format!("encoder ignored {name}: {}", error.message()));
                }
            }
            let info = mft.GetOutputStreamInfo(0)?;
            let provides_samples = info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32 | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES.0 as u32) != 0;
            mft.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            mft.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
            let events: IMFMediaEventGenerator = mft.cast()?;
            Ok(Self { mft, events, provides_samples, output_size: info.cbSize, need: 0, typed: false })
        }
    }

    fn pump(&mut self, shared: &Shared) -> Result<()> {
        unsafe {
            while let Ok(event) = self.events.GetEvent(MF_EVENT_FLAG_NO_WAIT) {
                let kind = event.GetType()?;
                if kind == METransformNeedInput.0 as u32 {
                    self.need += 1;
                } else if kind == METransformHaveOutput.0 as u32 {
                    let Some(packet) = self.output()? else { continue };
                    // The output type carries the sequence header only once the first frame is out.
                    if !self.typed {
                        let media_type = self.mft.GetOutputCurrentType(0)?;
                        *shared.video_type.lock().unwrap() = Some(crate::type_blob(&media_type)?);
                        self.typed = true;
                    }
                    shared.ring.lock().unwrap().push_video(packet);
                }
            }
        }
        Ok(())
    }

    fn output(&mut self) -> Result<Option<Packet>> {
        unsafe {
            let sample = if self.provides_samples {
                None
            } else {
                let sample = MFCreateSample()?;
                sample.AddBuffer(&MFCreateMemoryBuffer(self.output_size)?)?;
                Some(sample)
            };
            let mut buffers = [MFT_OUTPUT_DATA_BUFFER { dwStreamID: 0, pSample: ManuallyDrop::new(sample), dwStatus: 0, pEvents: ManuallyDrop::new(None) }];
            let mut status = 0;
            let result = self.mft.ProcessOutput(0, &mut buffers, &mut status);
            let sample = ManuallyDrop::take(&mut buffers[0].pSample);
            drop(ManuallyDrop::take(&mut buffers[0].pEvents));
            if let Err(error) = result {
                if error.code() == MF_E_TRANSFORM_STREAM_CHANGE {
                    let media_type = self.mft.GetOutputAvailableType(0, 0)?;
                    self.mft.SetOutputType(0, &media_type, 0)?;
                    return Ok(None);
                }
                return Err(error);
            }
            let Some(sample) = sample else { return Ok(None) };
            let buffer = sample.ConvertToContiguousBuffer()?;
            let mut data = std::ptr::null_mut();
            let mut length = 0;
            buffer.Lock(&mut data, None, Some(&mut length))?;
            let bytes = std::slice::from_raw_parts(data, length as usize).to_vec();
            buffer.Unlock()?;
            Ok(Some(Packet {
                time: sample.GetSampleTime()?,
                duration: sample.GetSampleDuration().unwrap_or(0),
                key: sample.GetUINT32(&MFSampleExtension_CleanPoint).unwrap_or(0) == 1,
                data: bytes,
            }))
        }
    }

    fn submit(&mut self, frame: &ID3D11Texture2D, time: i64, duration: i64) -> Result<()> {
        unsafe {
            let sample = MFCreateSample()?;
            sample.AddBuffer(&MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, frame, 0, false)?)?;
            sample.SetSampleTime(time)?;
            sample.SetSampleDuration(duration)?;
            self.mft.ProcessInput(0, &sample, 0)?;
            self.need -= 1;
            Ok(())
        }
    }
}

// A retired encoder is released a few seconds late: NVIDIA's H.264 encoder still runs a queued
// work item after shutdown, and releasing it straight away crashed in that callback.
const RETIREMENT: Duration = Duration::from_secs(3);

struct Retired {
    _mft: IMFTransform,
    _events: IMFMediaEventGenerator,
    since: Instant,
}

impl Encoder {
    fn retire(mut self) -> Retired {
        unsafe {
            let _ = self.mft.ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
            if self.mft.ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0).is_ok() {
                let started = Instant::now();
                while started.elapsed() < Duration::from_secs(1) {
                    match self.events.GetEvent(MF_EVENT_FLAG_NO_WAIT) {
                        Ok(event) => match event.GetType() {
                            Ok(kind) if kind == METransformHaveOutput.0 as u32 => {
                                if self.output().is_err() {
                                    break;
                                }
                            }
                            Ok(kind) if kind == METransformDrainComplete.0 as u32 => break,
                            _ => {}
                        },
                        Err(_) => std::thread::sleep(Duration::from_millis(2)),
                    }
                }
            }
            let _ = self.mft.ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
            if let Ok(shutdown) = self.mft.cast::<IMFShutdown>() {
                let _ = shutdown.Shutdown();
            }
            Retired { _mft: self.mft, _events: self.events, since: Instant::now() }
        }
    }
}

struct Session {
    encoder: Encoder,
    ctx: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    frame: ID3D11Texture2D,
    hdr: Option<HdrPass>,
    // Scene peak and SDR white level the tone-mapping tables are built from.
    curve: (f32, f32),
    video_ctx: ID3D11VideoContext1,
    processor: ID3D11VideoProcessor,
    input: ID3D11VideoProcessorInputView,
    pool: Vec<(ID3D11Texture2D, ID3D11VideoProcessorOutputView)>,
    monitor: HMONITOR,
    _manager: IMFDXGIDeviceManager,
    device: ID3D11Device,
}

impl Session {
    fn open(config: &Config) -> Result<Self> {
        unsafe {
            let opening = Instant::now();
            let monitor = game_monitor(config.pid);
            let (adapter, output) = output_for(monitor)?;
            let adapter_desc = adapter.GetDesc1()?;
            let output_desc = output.GetDesc()?;
            let mut device = None;
            let mut ctx = None;
            D3D11CreateDevice(
                &adapter,
                D3D_DRIVER_TYPE_UNKNOWN,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut ctx),
            )?;
            let device: ID3D11Device = device.unwrap();
            let ctx: ID3D11DeviceContext = ctx.unwrap();
            let _ = device.cast::<ID3D11Multithread>()?.SetMultithreadProtected(true);

            // Automatic colour management composes even an SDR desktop in FP16, so only a display
            // that DisplayConfig reports in HDR gets the tone-mapping pass.
            let display = path_for_device(&output_desc.DeviceName).ok();
            let hdr_display = match config.hdr {
                HdrMode::Off => false,
                HdrMode::Force => true,
                HdrMode::Auto => display.as_ref().is_some_and(|path| path_hdr_enabled(path).unwrap_or(false)),
            };
            let formats: &[DXGI_FORMAT] = if hdr_display { &[DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_FORMAT_B8G8R8A8_UNORM] } else { &[DXGI_FORMAT_B8G8R8A8_UNORM] };
            let duplication = output.cast::<IDXGIOutput5>()?.DuplicateOutput1(&device, 0, formats)?;
            let mode = duplication.GetDesc().ModeDesc;
            let (width, height) = (mode.Width, mode.Height);
            let frame = texture(&device, width, height, DXGI_FORMAT_B8G8R8A8_UNORM, D3D11_BIND_FLAG(D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0))?;

            // An FP16 frame from a display that is not in HDR is plain SDR in scRGB: the identity curve.
            let curve = if hdr_display {
                let white_scale = display.as_ref().map_or(1.0, path_sdr_white_scale);
                let peak_nits = output.cast::<IDXGIOutput6>().and_then(|o| o.GetDesc1()).map(|d| d.MaxLuminance).unwrap_or(0.0);
                let peak_nits = if peak_nits.is_finite() && peak_nits > 80.0 * white_scale * 1.05 { peak_nits } else { DEFAULT_PEAK_NITS };
                let scene_peak = (peak_nits / 80.0 / white_scale).clamp(1.0, rel_from_pq(1.0));
                log(&format!("hdr display: SDR white {white_scale:.2}, peak {peak_nits:.0} nits, curve peak {scene_peak:.2}"));
                (scene_peak, white_scale)
            } else {
                (1.0, 1.0)
            };

            let out_height = (if config.height == 0 { height } else { config.height.min(height) }) & !1;
            let out_width = ((width as u64 * out_height as u64 / height as u64) as u32) & !1;
            let video_device: ID3D11VideoDevice = device.cast()?;
            let video_ctx: ID3D11VideoContext1 = ctx.cast()?;
            let content = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
                InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
                InputFrameRate: DXGI_RATIONAL { Numerator: config.fps, Denominator: 1 },
                InputWidth: width,
                InputHeight: height,
                OutputFrameRate: DXGI_RATIONAL { Numerator: config.fps, Denominator: 1 },
                OutputWidth: out_width,
                OutputHeight: out_height,
                Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
            };
            let enumerator = video_device.CreateVideoProcessorEnumerator(&content)?;
            let processor = video_device.CreateVideoProcessor(&enumerator, 0)?;
            video_ctx.VideoProcessorSetStreamColorSpace1(&processor, 0, DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709);
            video_ctx.VideoProcessorSetOutputColorSpace1(&processor, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709);
            video_ctx.VideoProcessorSetStreamAutoProcessingMode(&processor, 0, false);
            let input_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
                FourCC: 0,
                ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPIV { MipSlice: 0, ArraySlice: 0 } },
            };
            let mut input = None;
            video_device.CreateVideoProcessorInputView(&frame, &enumerator, &input_desc, Some(&mut input))?;
            let output_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
                ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
                Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 } },
            };
            let mut pool = Vec::with_capacity(POOL);
            for _ in 0..POOL {
                let nv12 = texture(&device, out_width, out_height, DXGI_FORMAT_NV12, D3D11_BIND_RENDER_TARGET)?;
                let mut view = None;
                video_device.CreateVideoProcessorOutputView(&nv12, &enumerator, &output_desc, Some(&mut view))?;
                pool.push((nv12, view.unwrap()));
            }

            let mut token = 0;
            let mut manager = None;
            MFCreateDXGIDeviceManager(&mut token, &mut manager)?;
            let manager = manager.unwrap();
            manager.ResetDevice(&device, token)?;
            let mut codec = config.codec.as_str();
            let (activate, name) = match find_encoder(adapter_desc.AdapterLuid, codec_subtype(codec))? {
                Some(found) => found,
                None if codec != "h264" => {
                    log(&format!("no {codec} hardware encoder on this GPU, using H.264"));
                    codec = "h264";
                    find_encoder(adapter_desc.AdapterLuid, MFVideoFormat_H264)?.ok_or_else(|| Error::new(E_FAIL, "no-encoder"))?
                }
                None => return Err(Error::new(E_FAIL, "no-encoder")),
            };
            let bits = bitrate(&config.quality, codec, out_width, out_height, config.fps);
            let encoder = Encoder::new(&manager, &activate, codec_subtype(codec), (out_width, out_height), config.fps, bits)?;
            crate::emit(&format!(
                "ready encoder=\"{name}\" codec={codec} capture={width}x{height} output={out_width}x{out_height} fps={} bitrate={:.1}Mb/s hdr={} took={}ms",
                config.fps,
                bits as f64 / 1e6,
                if hdr_display { "on" } else { "off" },
                opening.elapsed().as_millis()
            ));
            Ok(Self { ctx, duplication, frame, hdr: None, curve, video_ctx, processor, input: input.unwrap(), pool, encoder, monitor, _manager: manager, device })
        }
    }

    // The mode description can say FP16 while the frames come as 8-bit, so each frame's own format
    // decides whether it goes through the tone-mapping pass.
    fn convert(&mut self, resource: IDXGIResource, slot: usize) -> Result<()> {
        unsafe {
            let desktop: ID3D11Texture2D = resource.cast()?;
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            desktop.GetDesc(&mut desc);
            if desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT {
                if self.hdr.is_none() {
                    self.hdr = Some(HdrPass::new(&self.device, &self.frame, desc.Width, desc.Height, self.curve.0, self.curve.1)?);
                }
                let hdr = self.hdr.as_ref().unwrap();
                self.ctx.CopyResource(&hdr.source, &desktop);
                hdr.draw(&self.ctx);
            } else {
                self.ctx.CopyResource(&self.frame, &desktop);
            }
            let streams = [D3D11_VIDEO_PROCESSOR_STREAM { Enable: TRUE, pInputSurface: ManuallyDrop::new(Some(self.input.clone())), ..Default::default() }];
            let result = self.video_ctx.VideoProcessorBlt(&self.processor, &self.pool[slot].1, 0, &streams);
            let [stream] = streams;
            drop(ManuallyDrop::into_inner(stream.pInputSurface));
            result
        }
    }

    // The encoder is retired first, while the textures and device it reads still exist.
    fn close(self) -> Retired {
        let Session { encoder, .. } = self;
        encoder.retire()
    }

    // Runs until asked to stop; an error means the capture has to be rebuilt.
    fn run(&mut self, config: &Config, shared: &Shared) -> Result<()> {
        let interval = SECOND / config.fps as i64;
        let mut tick = now();
        let mut filled = None;
        let mut slot = 0;
        let mut checked = Instant::now();
        while !shared.stop.load(Ordering::Relaxed) {
            tick += interval;
            let ahead = tick - now();
            if ahead > 0 {
                std::thread::sleep(Duration::from_nanos(ahead as u64 * 100));
            } else if ahead < -SECOND {
                // Back from a long stall: restart the clock instead of submitting a burst.
                log(&format!("video paused for {} ms", -ahead / (SECOND / 1000)));
                tick = now();
            }
            unsafe {
                let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
                let mut resource = None;
                match self.duplication.AcquireNextFrame(0, &mut info, &mut resource) {
                    Ok(()) => {
                        // Zero means only the pointer moved.
                        let changed = info.LastPresentTime != 0;
                        let converted = if changed { self.convert(resource.unwrap(), slot) } else { Ok(()) };
                        self.duplication.ReleaseFrame()?;
                        converted?;
                        if changed {
                            filled = Some(slot);
                            slot = (slot + 1) % POOL;
                        }
                    }
                    Err(error) if error.code() == DXGI_ERROR_WAIT_TIMEOUT => {}
                    Err(error) => return Err(error),
                }
            }
            self.encoder.pump(shared)?;
            if let Some(ready) = filled {
                let waiting = Instant::now();
                while self.encoder.need == 0 && waiting.elapsed() < INPUT_WAIT {
                    std::thread::sleep(Duration::from_millis(1));
                    self.encoder.pump(shared)?;
                }
                if self.encoder.need > 0 {
                    self.encoder.submit(&self.pool[ready].0, tick, interval)?;
                    shared.encoded.fetch_add(1, Ordering::Relaxed);
                } else {
                    shared.dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
            if checked.elapsed() > MONITOR_CHECK {
                checked = Instant::now();
                if game_monitor(config.pid) != self.monitor {
                    return Err(Error::new(E_FAIL, "the game moved to another monitor"));
                }
            }
        }
        Ok(())
    }
}

// Rebuilds the whole pipeline whenever it breaks: a mode or HDR change, the secure desktop, a
// driver reset. Each rebuild starts a new stream, so the ring is emptied first.
pub fn run(config: &Config, shared: &Shared) {
    let mut failures = 0u32;
    let mut retired: Vec<Retired> = Vec::new();
    while !shared.stop.load(Ordering::Relaxed) {
        retired.retain(|encoder| encoder.since.elapsed() < RETIREMENT);
        match Session::open(config) {
            Ok(mut session) => {
                failures = 0;
                let result = session.run(config, shared);
                retired.push(session.close());
                match result {
                    Ok(()) => {
                        // The process exits next, after stopping Media Foundation's work queues, so
                        // the last encoders are left for the exit instead of released now.
                        std::mem::forget(retired);
                        return;
                    }
                    Err(error) => log(&format!("capture restarted: {}", error.message())),
                }
            }
            Err(error) => {
                if error.message() == "no-encoder" {
                    crate::emit("error no-encoder no hardware video encoder on this GPU");
                    shared.stop.store(true, Ordering::Relaxed);
                    return;
                }
                failures += 1;
                if failures == 1 || failures % 30 == 0 {
                    log(&format!("capture unavailable ({failures}): {}", error.message()));
                }
            }
        }
        shared.ring.lock().unwrap().clear_video();
        *shared.video_type.lock().unwrap() = None;
        let pause = Duration::from_millis(250 * u64::from(failures.clamp(1, 8)));
        let started = Instant::now();
        while started.elapsed() < pause && !shared.stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}
