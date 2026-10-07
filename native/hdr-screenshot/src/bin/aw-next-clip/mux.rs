// Writes a clip to MP4 without re-encoding: the sink writer takes the encoders' own output types as
// input types, so it only packages the packets.
use windows::Win32::Media::MediaFoundation::*;
use windows::core::{HSTRING, Result};

use crate::ring::{Clip, Packet};

fn media_type(blob: &[u8]) -> Result<IMFMediaType> {
    unsafe {
        let media_type = MFCreateMediaType()?;
        MFInitAttributesFromBlob(&media_type, blob)?;
        Ok(media_type)
    }
}

fn sample(packet: &Packet, duration: i64) -> Result<IMFSample> {
    unsafe {
        let buffer = MFCreateMemoryBuffer(packet.data.len() as u32)?;
        let mut target = std::ptr::null_mut();
        buffer.Lock(&mut target, None, None)?;
        std::ptr::copy_nonoverlapping(packet.data.as_ptr(), target, packet.data.len());
        buffer.Unlock()?;
        buffer.SetCurrentLength(packet.data.len() as u32)?;
        let sample = MFCreateSample()?;
        sample.AddBuffer(&buffer)?;
        sample.SetSampleTime(packet.time)?;
        sample.SetSampleDuration(duration)?;
        if packet.key {
            sample.SetUINT32(&MFSampleExtension_CleanPoint, 1)?;
        }
        Ok(sample)
    }
}

fn write_to(path: &str, clip: &Clip, video_type: &[u8], audio_type: Option<&[u8]>, frame: i64) -> Result<()> {
    unsafe {
        let attributes = {
            let mut attributes = None;
            MFCreateAttributes(&mut attributes, 1)?;
            attributes.unwrap()
        };
        // The temporary name has no .mp4 extension to infer the container from.
        attributes.SetGUID(&MF_TRANSCODE_CONTAINERTYPE, &MFTranscodeContainerType_MPEG4)?;
        let writer = MFCreateSinkWriterFromURL(&HSTRING::from(path), None, &attributes)?;
        let video_stream = {
            let media_type = media_type(video_type)?;
            let stream = writer.AddStream(&media_type)?;
            writer.SetInputMediaType(stream, &media_type, None)?;
            stream
        };
        let audio_stream = match audio_type {
            Some(blob) if !clip.audio.is_empty() => {
                let media_type = media_type(blob)?;
                let stream = writer.AddStream(&media_type)?;
                writer.SetInputMediaType(stream, &media_type, None)?;
                Some(stream)
            }
            _ => None,
        };
        writer.BeginWriting()?;

        // Interleaved by time, so neither stream has to be buffered whole by the writer.
        let (mut v, mut a) = (0, 0);
        while v < clip.video.len() || (audio_stream.is_some() && a < clip.audio.len()) {
            let take_video = a >= clip.audio.len() || audio_stream.is_none() || (v < clip.video.len() && clip.video[v].time <= clip.audio[a].time);
            if take_video {
                let packet = &clip.video[v];
                let duration = clip.video.get(v + 1).map_or(frame, |next| (next.time - packet.time).max(1));
                writer.WriteSample(video_stream, &sample(packet, duration)?)?;
                v += 1;
            } else {
                let packet = &clip.audio[a];
                writer.WriteSample(audio_stream.unwrap(), &sample(packet, packet.duration)?)?;
                a += 1;
            }
        }
        writer.Finalize()
    }
}

// The antivirus or the search indexer often opens a file the moment it is closed; touching it then
// fails with a sharing violation (seen in the Videos folder), so the rename is retried for a while.
const BUSY_RETRIES: u32 = 50;
const BUSY_PAUSE: std::time::Duration = std::time::Duration::from_millis(100);

fn retry_while_busy(mut action: impl FnMut() -> std::io::Result<()>) -> std::io::Result<()> {
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
pub fn write(path: &str, clip: &Clip, video_type: &[u8], audio_type: Option<&[u8]>, frame: i64) -> std::result::Result<(), String> {
    let partial = format!("{path}.part");
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let result = write_to(&partial, clip, video_type, audio_type, frame)
        .map_err(|error| error.message().to_string())
        .and_then(|()| retry_while_busy(|| std::fs::rename(&partial, path)).map_err(|error| error.to_string()));
    if result.is_err() {
        let _ = retry_while_busy(|| std::fs::remove_file(&partial));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_held_for_a_moment_is_retried() {
        let mut calls = 0;
        let result = retry_while_busy(|| {
            calls += 1;
            if calls < 3 { Err(std::io::Error::from_raw_os_error(32)) } else { Ok(()) }
        });
        assert!(result.is_ok());
        assert_eq!(calls, 3);
    }

    #[test]
    fn other_failures_are_not_retried() {
        let mut calls = 0;
        let result = retry_while_busy(|| {
            calls += 1;
            Err(std::io::Error::from_raw_os_error(2))
        });
        assert!(result.is_err());
        assert_eq!(calls, 1);
    }
}
