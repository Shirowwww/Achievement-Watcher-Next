// What the game plays (process loopback on its process tree) or everything the PC plays, encoded
// to AAC by Windows' own encoder and timed on the same clock as the video.
use std::mem::ManuallyDrop;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::time::Duration;

use windows::Win32::Foundation::*;
use windows::Win32::Media::Audio::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::StructuredStorage::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::AvSetMmThreadCharacteristicsW;
use windows::Win32::System::Variant::VT_BLOB;
use windows::core::*;

use crate::ring::{Packet, SECOND};
use crate::{AudioSource, Config, Shared, log, now};

const RATE: u32 = 48_000;
const FRAME_BYTES: usize = 4;
// Longer gaps than this in the loopback stream are filled with silence to keep the clock honest.
const GAP: i64 = SECOND / 50;

#[implement(IActivateAudioInterfaceCompletionHandler, IAgileObject)]
struct Activated(mpsc::Sender<()>);

impl IActivateAudioInterfaceCompletionHandler_Impl for Activated_Impl {
    fn ActivateCompleted(&self, _operation: Ref<IActivateAudioInterfaceAsyncOperation>) -> Result<()> {
        let _ = self.0.send(());
        Ok(())
    }
}

impl IAgileObject_Impl for Activated_Impl {}

fn process_client(pid: u32) -> Result<IAudioClient> {
    unsafe {
        let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS { TargetProcessId: pid, ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE },
            },
        };
        let mut variant = PROPVARIANT::default();
        (*variant.Anonymous.Anonymous).vt = VT_BLOB;
        (*variant.Anonymous.Anonymous).Anonymous.blob = BLOB { cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32, pBlobData: &mut params as *mut _ as *mut u8 };
        let (sender, receiver) = mpsc::channel();
        let handler: IActivateAudioInterfaceCompletionHandler = Activated(sender).into();
        let operation = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, &IAudioClient::IID, Some(&variant), &handler);
        // The blob points at `params`, which the variant does not own.
        std::mem::forget(variant);
        let operation = operation?;
        receiver.recv_timeout(Duration::from_secs(5)).map_err(|_| Error::new(E_FAIL, "process loopback did not answer"))?;
        let mut result = HRESULT(0);
        let mut client = None;
        operation.GetActivateResult(&mut result, &mut client)?;
        result.ok()?;
        client.ok_or_else(|| Error::new(E_FAIL, "no audio client"))?.cast()
    }
}

fn speakers_client() -> Result<IAudioClient> {
    unsafe {
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        devices.GetDefaultAudioEndpoint(eRender, eConsole)?.Activate(CLSCTX_ALL, None)
    }
}

fn aac_encoder() -> Result<IMFTransform> {
    unsafe {
        let input = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Audio, guidSubtype: MFAudioFormat_PCM };
        let output = MFT_REGISTER_TYPE_INFO { guidMajorType: MFMediaType_Audio, guidSubtype: MFAudioFormat_AAC };
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0;
        MFTEnumEx(MFT_CATEGORY_AUDIO_ENCODER, MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_SORTANDFILTER, Some(&input), Some(&output), &mut list, &mut count)?;
        let found = std::slice::from_raw_parts(list, count as usize).iter().flatten().next().cloned();
        for item in std::slice::from_raw_parts_mut(list, count as usize) {
            drop(item.take());
        }
        if !list.is_null() {
            CoTaskMemFree(Some(list as *const _));
        }
        let encoder: IMFTransform = found.ok_or_else(|| Error::new(E_FAIL, "no AAC encoder"))?.ActivateObject()?;
        let pcm = MFCreateMediaType()?;
        pcm.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
        pcm.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)?;
        pcm.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
        pcm.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, RATE)?;
        pcm.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)?;
        pcm.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, FRAME_BYTES as u32)?;
        pcm.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, RATE * FRAME_BYTES as u32)?;
        encoder.SetInputType(0, &pcm, 0)?;
        let aac = MFCreateMediaType()?;
        aac.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)?;
        aac.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)?;
        aac.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)?;
        aac.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, RATE)?;
        aac.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2)?;
        // 20000 bytes a second is 160 kb/s, one of the four rates this encoder accepts.
        aac.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 20_000)?;
        aac.SetUINT32(&MF_MT_AAC_PAYLOAD_TYPE, 0)?;
        encoder.SetOutputType(0, &aac, 0)?;
        encoder.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
        Ok(encoder)
    }
}

struct Pipeline {
    encoder: IMFTransform,
    // Performance-counter time of the next PCM frame to encode.
    next: Option<i64>,
}

impl Pipeline {
    fn encode(&mut self, pcm: &[u8], time: i64, shared: &Shared) -> Result<()> {
        unsafe {
            let frames = (pcm.len() / FRAME_BYTES) as i64;
            let buffer = MFCreateMemoryBuffer(pcm.len() as u32)?;
            let mut target = std::ptr::null_mut();
            buffer.Lock(&mut target, None, None)?;
            std::ptr::copy_nonoverlapping(pcm.as_ptr(), target, pcm.len());
            buffer.Unlock()?;
            buffer.SetCurrentLength(pcm.len() as u32)?;
            let sample = MFCreateSample()?;
            sample.AddBuffer(&buffer)?;
            sample.SetSampleTime(time)?;
            sample.SetSampleDuration(frames * SECOND / RATE as i64)?;
            self.encoder.ProcessInput(0, &sample, 0)?;
            self.next = Some(time + frames * SECOND / RATE as i64);
            self.drain(shared)
        }
    }

    fn drain(&mut self, shared: &Shared) -> Result<()> {
        unsafe {
            let size = self.encoder.GetOutputStreamInfo(0)?.cbSize.max(8192);
            loop {
                let sample = MFCreateSample()?;
                sample.AddBuffer(&MFCreateMemoryBuffer(size)?)?;
                let mut buffers = [MFT_OUTPUT_DATA_BUFFER { dwStreamID: 0, pSample: ManuallyDrop::new(Some(sample)), dwStatus: 0, pEvents: ManuallyDrop::new(None) }];
                let mut status = 0;
                let result = self.encoder.ProcessOutput(0, &mut buffers, &mut status);
                let sample = ManuallyDrop::take(&mut buffers[0].pSample).unwrap();
                drop(ManuallyDrop::take(&mut buffers[0].pEvents));
                match result {
                    Ok(()) => {
                        let buffer = sample.ConvertToContiguousBuffer()?;
                        let mut data = std::ptr::null_mut();
                        let mut length = 0;
                        buffer.Lock(&mut data, None, Some(&mut length))?;
                        let bytes = std::slice::from_raw_parts(data, length as usize).to_vec();
                        buffer.Unlock()?;
                        let packet = Packet { time: sample.GetSampleTime()?, duration: sample.GetSampleDuration().unwrap_or(0), key: true, data: bytes };
                        shared.ring.lock().unwrap().push_audio(packet);
                    }
                    Err(error) if error.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => return Ok(()),
                    Err(error) => return Err(error),
                }
            }
        }
    }
}

fn capture(config: &Config, shared: &Shared) -> Result<()> {
    unsafe {
        let mut task = 0;
        let _ = AvSetMmThreadCharacteristicsW(w!("Audio"), &mut task);
        let (client, source) = match config.audio {
            AudioSource::Game if config.pid != 0 => match process_client(config.pid) {
                Ok(client) => (client, "game"),
                Err(error) => {
                    log(&format!("game audio unavailable ({}), recording the whole PC", error.message()));
                    (speakers_client()?, "pc")
                }
            },
            _ => (speakers_client()?, "pc"),
        };
        let format = WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_PCM as u16,
            nChannels: 2,
            nSamplesPerSec: RATE,
            nAvgBytesPerSec: RATE * FRAME_BYTES as u32,
            nBlockAlign: FRAME_BYTES as u16,
            wBitsPerSample: 16,
            cbSize: 0,
        };
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
            2 * SECOND / 10,
            0,
            &format,
            None,
        )?;
        let reader: IAudioCaptureClient = client.GetService()?;
        let mut pipeline = Pipeline { encoder: aac_encoder()?, next: None };
        *shared.audio_type.lock().unwrap() = Some(crate::type_blob(&pipeline.encoder.GetOutputCurrentType(0)?)?);
        client.Start()?;
        log(&format!("audio: {source}"));

        while !shared.stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(10));
            while reader.GetNextPacketSize()? > 0 {
                let mut data = std::ptr::null_mut();
                let (mut frames, mut flags, mut position) = (0u32, 0u32, 0u64);
                reader.GetBuffer(&mut data, &mut frames, &mut flags, None, Some(&mut position))?;
                let bytes = frames as usize * FRAME_BYTES;
                let pcm = if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    vec![0; bytes]
                } else {
                    std::slice::from_raw_parts(data, bytes).to_vec()
                };
                reader.ReleaseBuffer(frames)?;
                if bytes == 0 {
                    continue;
                }
                let captured = if position != 0 { position as i64 } else { now() - frames as i64 * SECOND / RATE as i64 };
                let time = match pipeline.next {
                    Some(next) if captured - next > GAP => {
                        // Nothing was playing for a while: keep the timeline by encoding the silence.
                        let missing = ((captured - next).min(10 * SECOND) * RATE as i64 / SECOND) as usize;
                        pipeline.encode(&vec![0; missing * FRAME_BYTES], next, shared)?;
                        pipeline.next.unwrap()
                    }
                    // Never step back: the encoder and the MP4 need increasing times.
                    Some(next) => next,
                    None => captured,
                };
                pipeline.encode(&pcm, time, shared)?;
            }
        }
        let _ = client.Stop();
        Ok(())
    }
}

pub fn run(config: &Config, shared: &Shared) {
    if config.audio == AudioSource::Off {
        return;
    }
    if let Err(error) = capture(config, shared) {
        log(&format!("audio stopped, clips continue without sound: {}", error.message()));
    }
}
