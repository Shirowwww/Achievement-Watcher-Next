// Writes a clip to MP4 without re-encoding: the encoders' packets go into the file as they are,
// through mp4.rs, with what the file has to say about them read from the encoders' output types.
// Windows' own MP4 writer is not used: Windows 10, and Windows 11 before the 22H2 update of August
// 2023, cannot put AV1 into an MP4 with it (no av01 sample entry in mfmp4srcsnk.dll).
use std::fs::File;
use std::io::{self, BufWriter, Write};

use windows::Win32::Media::MediaFoundation::*;
use windows::core::GUID;

use crate::codec::{Codec, Config};
use crate::mp4::{self, Audio, Color, Video};
use crate::ring::{Clip, Packet, SECOND};

// A clip cut short by a write error is kept when it still holds this much video.
const MIN_PARTIAL: i64 = SECOND;
// Room left for the file system when a shorter clip is fitted into the space a failed write found.
const SPACE_MARGIN: u64 = 1 << 20;
const WRITE_BUFFER: usize = 1 << 20;

pub enum Outcome {
    Complete,
    // The full clip could not be written; a shorter one with `frames` of `of` video frames was.
    Partial { frames: usize, of: usize, cause: String },
}

struct VideoType {
    codec: Codec,
    header: Vec<u8>,
    width: u32,
    height: u32,
    color: Option<Color>,
}

struct AudioType {
    rate: u32,
    channels: u16,
    specific: Vec<u8>,
}

fn media_type(blob: &[u8]) -> windows::core::Result<IMFMediaType> {
    unsafe {
        let media_type = MFCreateMediaType()?;
        MFInitAttributesFromBlob(&media_type, blob)?;
        Ok(media_type)
    }
}

fn blob(media_type: &IMFMediaType, key: &GUID) -> Option<Vec<u8>> {
    unsafe {
        let size = media_type.GetBlobSize(key).ok()?;
        let mut value = vec![0u8; size as usize];
        media_type.GetBlob(key, &mut value, None).ok()?;
        Some(value)
    }
}

// ITU-T H.273 code points for the Media Foundation values; 2 means unspecified.
fn color(media_type: &IMFMediaType) -> Option<Color> {
    let read = |key: &GUID| unsafe { media_type.GetUINT32(key).ok() };
    let primaries = match read(&MF_MT_VIDEO_PRIMARIES)? as i32 {
        p if p == MFVideoPrimaries_BT709.0 => 1,
        p if p == MFVideoPrimaries_BT2020.0 => 9,
        _ => 2,
    };
    let transfer = match read(&MF_MT_TRANSFER_FUNCTION).unwrap_or(0) as i32 {
        t if t == MFVideoTransFunc_709.0 => 1,
        t if t == MFVideoTransFunc_sRGB.0 => 13,
        t if t == MFVideoTransFunc_2084.0 => 16,
        t if t == MFVideoTransFunc_HLG.0 => 18,
        _ => 2,
    };
    let matrix = match read(&MF_MT_YUV_MATRIX).unwrap_or(0) as i32 {
        m if m == MFVideoTransferMatrix_BT709.0 => 1,
        m if m == MFVideoTransferMatrix_BT601.0 => 6,
        m if m == MFVideoTransferMatrix_BT2020_10.0 || m == MFVideoTransferMatrix_BT2020_12.0 => 9,
        _ => 2,
    };
    let full_range = read(&MF_MT_VIDEO_NOMINAL_RANGE).is_some_and(|r| r as i32 == MFNominalRange_0_255.0);
    Some(Color { primaries, transfer, matrix, full_range })
}

fn video_type(blob_bytes: &[u8]) -> Result<VideoType, String> {
    let media_type = media_type(blob_bytes).map_err(|e| e.message())?;
    unsafe {
        let subtype = media_type.GetGUID(&MF_MT_SUBTYPE).map_err(|e| e.message())?;
        let codec = match subtype {
            s if s == MFVideoFormat_H264 => Codec::H264,
            s if s == MFVideoFormat_HEVC => Codec::Hevc,
            s if s == MFVideoFormat_AV1 => Codec::Av1,
            _ => return Err("the video format has no MP4 sample entry here".into()),
        };
        let size = media_type.GetUINT64(&MF_MT_FRAME_SIZE).map_err(|e| e.message())?;
        Ok(VideoType {
            codec,
            header: blob(&media_type, &MF_MT_MPEG_SEQUENCE_HEADER).unwrap_or_default(),
            width: (size >> 32) as u32,
            height: size as u32,
            color: color(&media_type),
        })
    }
}

// The AAC encoder's MF_MT_USER_DATA is the tail of HEAACWAVEINFO (12 bytes) and then the
// AudioSpecificConfig; without it, an AAC-LC one is built from the rate and channels. A real one is
// 2 to 5 bytes, and mp4.rs writes the esds lengths on one byte.
const HEAAC_INFO_TAIL: usize = 12;
const MAX_SPECIFIC: usize = 64;
const AAC_RATES: [u32; 13] = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

fn audio_type(blob_bytes: &[u8]) -> Option<AudioType> {
    let media_type = media_type(blob_bytes).ok()?;
    unsafe {
        let rate = media_type.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND).ok()?;
        let channels = media_type.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS).ok()? as u16;
        let specific = match blob(&media_type, &MF_MT_USER_DATA) {
            Some(data) if (HEAAC_INFO_TAIL + 1..=HEAAC_INFO_TAIL + MAX_SPECIFIC).contains(&data.len()) => data[HEAAC_INFO_TAIL..].to_vec(),
            _ => {
                let index = AAC_RATES.iter().position(|&r| r == rate)? as u16;
                ((2 << 11) | (index << 7) | ((channels & 0xf) << 3)).to_be_bytes().to_vec()
            }
        };
        Some(AudioType { rate, channels, specific })
    }
}

// Counts what a write would produce without keeping it.
struct Counter(u64);

impl Write for Counter {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.0 += data.len() as u64;
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

// Counts the bytes that reached the file before a failure.
struct Tally<W: Write> {
    inner: W,
    written: u64,
}

impl<W: Write> Write for Tally<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let count = self.inner.write(data)?;
        self.written += count as u64;
        Ok(count)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

struct Muxing<'a> {
    config: Config,
    video: &'a VideoType,
    audio: Option<&'a AudioType>,
    clip: &'a Clip,
    frame: i64,
    created: u64,
}

impl Muxing<'_> {
    // The first `frames` video frames, and the sound up to where they end.
    fn emit(&self, frames: usize, out: &mut dyn Write) -> io::Result<()> {
        let packets = &self.clip.video[..frames];
        let end = self.clip.video.get(frames).map_or(i64::MAX, |p| p.time);
        let sound: &[Packet] = &self.clip.audio[..self.clip.audio.partition_point(|p| p.time < end)];
        let video = Video { config: &self.config, width: self.video.width, height: self.video.height, color: self.video.color, packets, frame: self.frame };
        let audio = self.audio.map(|a| Audio { rate: a.rate, channels: a.channels, specific: &a.specific, packets: sound });
        mp4::write(out, &video, audio.as_ref(), self.created)
    }

    fn size(&self, frames: usize) -> u64 {
        let mut counter = Counter(0);
        let _ = self.emit(frames, &mut counter);
        counter.0
    }

    // The most frames whose file fits in `budget` bytes, if that still makes a clip worth keeping.
    fn fitting(&self, budget: u64) -> Option<usize> {
        let least = self.clip.video.iter().position(|p| p.time >= MIN_PARTIAL)?;
        if self.size(least) > budget {
            return None;
        }
        let (mut low, mut high) = (least, self.clip.video.len() - 1);
        while low < high {
            let middle = (low + high).div_ceil(2);
            if self.size(middle) <= budget { low = middle } else { high = middle - 1 }
        }
        Some(low)
    }
}

fn write_file(path: &str, muxing: &Muxing, frames: usize) -> Result<(), (String, u64)> {
    let file = File::create(path).map_err(|e| (e.to_string(), 0))?;
    let mut out = Tally { inner: BufWriter::with_capacity(WRITE_BUFFER, file), written: 0 };
    let result = muxing.emit(frames, &mut out).and_then(|()| out.flush());
    result.map_err(|e| (e.to_string(), out.written))
}

// The antivirus or the search indexer often opens a file the moment it is closed; touching it then
// fails with a sharing violation (seen in the Videos folder), so the rename is retried for a while.
const BUSY_RETRIES: u32 = 50;
const BUSY_PAUSE: std::time::Duration = std::time::Duration::from_millis(100);

fn retry_while_busy(mut action: impl FnMut() -> io::Result<()>) -> io::Result<()> {
    let mut attempt = 0;
    loop {
        match action() {
            // ERROR_ACCESS_DENIED, ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
            Err(error) if matches!(error.raw_os_error(), Some(5 | 32 | 33)) && attempt < BUSY_RETRIES => {
                attempt += 1;
                std::thread::sleep(BUSY_PAUSE);
            }
            other => return other,
        }
    }
}

// Written under a temporary name and renamed, so a half-written clip never looks like a real one.
// A write that fails midway (a full disk) is redone as the longest clip that fits in what it managed
// to write; anything else is deleted. A finished file that cannot be renamed stays under its
// temporary name, as it is the only copy.
pub fn write(path: &str, clip: &Clip, video_type_blob: &[u8], audio_type_blob: Option<&[u8]>, frame: i64) -> Result<Outcome, String> {
    let video = video_type(video_type_blob)?;
    let first_key = clip.video.iter().find(|p| p.key).ok_or("the clip has no keyframe")?;
    let config = Config::new(video.codec, &video.header, &first_key.data)?;
    let audio = audio_type_blob.and_then(audio_type);
    let created = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let muxing = Muxing { config, video: &video, audio: audio.as_ref(), clip, frame, created };

    let partial = format!("{path}.part");
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let discard = |reason: String| {
        let _ = retry_while_busy(|| std::fs::remove_file(&partial));
        Err(reason)
    };
    let outcome = match write_file(&partial, &muxing, clip.video.len()) {
        Ok(()) => Outcome::Complete,
        Err((cause, written)) => {
            let _ = retry_while_busy(|| std::fs::remove_file(&partial));
            let Some(frames) = muxing.fitting(written.saturating_sub(SPACE_MARGIN)) else { return discard(cause) };
            if let Err((again, _)) = write_file(&partial, &muxing, frames) {
                return discard(format!("{cause}; a shorter clip failed too: {again}"));
            }
            Outcome::Partial { frames, of: clip.video.len(), cause }
        }
    };
    match retry_while_busy(|| std::fs::rename(&partial, path)) {
        Ok(()) => Ok(outcome),
        Err(error) => Err(format!("{error}; the finished clip stays at {partial}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::{HSTRING, Interface, w};

    // Opens the file the way a player would and reads its first picture, still compressed. The
    // temporary name has no .mp4 extension, so the container is named through the byte stream.
    fn playable(path: &str) -> bool {
        unsafe {
            let open = || -> windows::core::Result<IMFSourceReader> {
                let stream = MFCreateFile(MF_ACCESSMODE_READ, MF_OPENMODE_FAIL_IF_NOT_EXIST, MF_FILEFLAGS_NONE, &HSTRING::from(path))?;
                stream.cast::<IMFAttributes>()?.SetString(&MF_BYTESTREAM_CONTENT_TYPE, w!("video/mp4"))?;
                MFCreateSourceReaderFromByteStream(&stream, None)
            };
            let Ok(reader) = open() else { return false };
            for _ in 0..8 {
                let (mut flags, mut sample) = (0u32, None);
                let read = reader.ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, 0, None, Some(&mut flags), None, Some(&mut sample));
                if read.is_err() || flags & (MF_SOURCE_READERF_ERROR.0 as u32 | MF_SOURCE_READERF_ENDOFSTREAM.0 as u32) != 0 {
                    return false;
                }
                if sample.is_some() {
                    return true;
                }
            }
            false
        }
    }

    #[test]
    fn a_file_held_for_a_moment_is_retried() {
        let mut calls = 0;
        let result = retry_while_busy(|| {
            calls += 1;
            if calls < 3 { Err(io::Error::from_raw_os_error(32)) } else { Ok(()) }
        });
        assert!(result.is_ok());
        assert_eq!(calls, 3);
    }

    #[test]
    fn other_failures_are_not_retried() {
        let mut calls = 0;
        let result = retry_while_busy(|| {
            calls += 1;
            Err(io::Error::from_raw_os_error(2))
        });
        assert!(result.is_err());
        assert_eq!(calls, 1);
    }

    fn type_blob(set: impl Fn(&IMFMediaType)) -> Vec<u8> {
        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_FULL).unwrap();
            let media_type = MFCreateMediaType().unwrap();
            set(&media_type);
            crate::type_blob(&media_type).unwrap()
        }
    }

    // A real NVIDIA AV1 sequence header (1920x1080, 8-bit 4:2:0) and frames that only need to be
    // readable, not decodable: the reader hands samples over still compressed.
    const AV1_HEADER: [u8; 17] = [0x0a, 0x0f, 0, 0, 0, 0x4e, 0xab, 0xbf, 0xc3, 0x7e, 0, 0x10, 0xcc, 0x80, 0x80, 0x80, 0x82];

    fn av1_clip(seconds: i64) -> (Clip, Vec<u8>, Vec<u8>) {
        let video_type = type_blob(|t| unsafe {
            t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).unwrap();
            t.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_AV1).unwrap();
            t.SetUINT64(&MF_MT_FRAME_SIZE, (1920u64 << 32) | 1080).unwrap();
            t.SetBlob(&MF_MT_MPEG_SEQUENCE_HEADER, &AV1_HEADER).unwrap();
        });
        let audio_type = type_blob(|t| unsafe {
            t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio).unwrap();
            t.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC).unwrap();
            t.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 48000).unwrap();
            t.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2).unwrap();
        });
        let frame = |i: i64| {
            let mut data = vec![0x12, 0];
            if i % 60 == 0 {
                data.extend_from_slice(&AV1_HEADER);
            }
            data.extend_from_slice(&[0x32, 0x03, 0x10, 0, i as u8]);
            Packet { time: i * SECOND / 60, duration: SECOND / 60, key: i % 60 == 0, data }
        };
        let sound = |i: i64| Packet { time: i * 1024 * SECOND / 48000, duration: 1024 * SECOND / 48000, key: true, data: vec![0x21, 0x10, 4] };
        let clip = Clip { video: (0..seconds * 60).map(frame).collect(), audio: (0..seconds * 47).map(sound).collect() };
        (clip, video_type, audio_type)
    }

    #[test]
    fn windows_reads_back_an_av1_clip_written_here() {
        let (clip, video_type, audio_type) = av1_clip(3);
        let path = std::env::temp_dir().join(format!("aw-clip-mux-{}.mp4", std::process::id()));
        let path = path.to_str().unwrap();
        assert!(matches!(write(path, &clip, &video_type, Some(&audio_type), SECOND / 60), Ok(Outcome::Complete)));
        assert!(playable(path), "Media Foundation opens it and hands out the first frame");
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_file_that_is_not_a_clip_does_not_play() {
        unsafe { MFStartup(MF_VERSION, MFSTARTUP_FULL).unwrap() };
        let path = std::env::temp_dir().join(format!("aw-clip-mux-{}.part", std::process::id()));
        std::fs::write(&path, b"not an mp4, only text").unwrap();
        assert!(!playable(path.to_str().unwrap()));
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn a_full_disk_keeps_the_longest_clip_that_fits() {
        let (clip, video_blob, audio_blob) = av1_clip(5);
        let video = video_type(&video_blob).unwrap();
        let audio = audio_type(&audio_blob);
        let config = Config::new(video.codec, &video.header, &clip.video[0].data).unwrap();
        let muxing = Muxing { config, video: &video, audio: audio.as_ref(), clip: &clip, frame: SECOND / 60, created: 0 };
        let whole = muxing.size(clip.video.len());
        let frames = muxing.fitting(whole * 6 / 10).unwrap();
        assert!(muxing.size(frames) <= whole * 6 / 10 && muxing.size(frames + 1) > whole * 6 / 10);
        assert!(muxing.fitting(10).is_none(), "under a second of video is not worth keeping");
    }

    #[test]
    fn the_aac_config_comes_from_the_encoder_or_from_the_rate() {
        let with_user_data = type_blob(|t| unsafe {
            t.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 48000).unwrap();
            t.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2).unwrap();
            t.SetBlob(&MF_MT_USER_DATA, &[0, 0, 0x29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x90]).unwrap();
        });
        assert_eq!(audio_type(&with_user_data).unwrap().specific, vec![0x11, 0x90]);
        let (_, _, without) = av1_clip(1);
        assert_eq!(audio_type(&without).unwrap().specific, vec![0x11, 0x90], "AAC-LC, 48 kHz, stereo");
    }

    #[test]
    fn an_oversized_aac_config_is_replaced_by_a_built_one() {
        let oversized = type_blob(|t| unsafe {
            t.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, 48000).unwrap();
            t.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 2).unwrap();
            t.SetBlob(&MF_MT_USER_DATA, &[0x11; HEAAC_INFO_TAIL + 300]).unwrap();
        });
        assert_eq!(audio_type(&oversized).unwrap().specific, vec![0x11, 0x90], "the esds lengths are one byte");
    }
}
