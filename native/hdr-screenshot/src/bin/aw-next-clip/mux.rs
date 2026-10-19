// Writes a clip to MP4 without re-encoding: the sink writer takes the encoders' own output types as
// input types, so it only packages the packets.
use windows::Win32::Media::MediaFoundation::*;
use windows::core::{HSTRING, Interface, Result, w};

use crate::ring::{Clip, Packet, SECOND};

// A clip cut short by a write error is kept when it still holds this much video.
const MIN_PARTIAL: i64 = SECOND;

pub enum Outcome {
    Complete,
    // The write stopped after `frames` of `of` video frames, but what was written plays.
    Partial { frames: usize, of: usize, cause: String },
}

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

// Where the packets go, so the order and the failure handling can be tested without a file.
trait Sink {
    fn video(&mut self, packet: &Packet, duration: i64) -> Result<()>;
    fn audio(&mut self, packet: &Packet) -> Result<()>;
}

struct WriterSink {
    writer: IMFSinkWriter,
    video: u32,
    audio: Option<u32>,
}

impl Sink for WriterSink {
    fn video(&mut self, packet: &Packet, duration: i64) -> Result<()> {
        unsafe { self.writer.WriteSample(self.video, &sample(packet, duration)?) }
    }

    fn audio(&mut self, packet: &Packet) -> Result<()> {
        match self.audio {
            Some(stream) => unsafe { self.writer.WriteSample(stream, &sample(packet, packet.duration)?) },
            None => Ok(()),
        }
    }
}

// Interleaved by time, so neither stream has to be buffered whole by the writer. Returns how many
// video frames went out and the error that stopped the loop, if any.
fn copy_packets(clip: &Clip, with_audio: bool, frame: i64, sink: &mut dyn Sink) -> (usize, Option<windows::core::Error>) {
    let (mut v, mut a) = (0, 0);
    while v < clip.video.len() || (with_audio && a < clip.audio.len()) {
        let take_video = a >= clip.audio.len() || !with_audio || (v < clip.video.len() && clip.video[v].time <= clip.audio[a].time);
        let step = if take_video {
            let packet = &clip.video[v];
            let duration = clip.video.get(v + 1).map_or(frame, |next| (next.time - packet.time).max(1));
            sink.video(packet, duration).inspect(|()| v += 1)
        } else {
            sink.audio(&clip.audio[a]).inspect(|()| a += 1)
        };
        if let Err(error) = step {
            return (v, Some(error));
        }
    }
    (v, None)
}

fn write_to(path: &str, clip: &Clip, video_type: &[u8], audio_type: Option<&[u8]>, frame: i64) -> Result<Outcome> {
    unsafe {
        let attributes = {
            let mut attributes = None;
            MFCreateAttributes(&mut attributes, 1)?;
            attributes.unwrap()
        };
        // The temporary name has no .mp4 extension to infer the container from.
        attributes.SetGUID(&MF_TRANSCODE_CONTAINERTYPE, &MFTranscodeContainerType_MPEG4)?;
        let writer = MFCreateSinkWriterFromURL(&HSTRING::from(path), None, &attributes)?;
        let video = {
            let media_type = media_type(video_type)?;
            let stream = writer.AddStream(&media_type)?;
            writer.SetInputMediaType(stream, &media_type, None)?;
            stream
        };
        let audio = match audio_type {
            Some(blob) if !clip.audio.is_empty() => {
                let media_type = media_type(blob)?;
                let stream = writer.AddStream(&media_type)?;
                writer.SetInputMediaType(stream, &media_type, None)?;
                Some(stream)
            }
            _ => None,
        };
        writer.BeginWriting()?;

        let mut sink = WriterSink { writer: writer.clone(), video, audio };
        let (frames, failure) = copy_packets(clip, audio.is_some(), frame, &mut sink);
        let Some(error) = failure else {
            writer.Finalize()?;
            return Ok(Outcome::Complete);
        };
        // An MP4 only becomes readable when it is finalized, so closing it here is what turns the
        // frames already written into a clip; the caller checks the result before keeping it.
        if frames as i64 * frame >= MIN_PARTIAL && writer.Finalize().is_ok() {
            return Ok(Outcome::Partial { frames, of: clip.video.len(), cause: error.message() });
        }
        Err(error)
    }
}

const PLAYABLE_READS: u32 = 8;

// Opens the file the way a player would and reads its first picture. The temporary name has no
// .mp4 extension, so the container is named through the byte stream.
fn playable(path: &str) -> bool {
    unsafe {
        let open = || -> Result<IMFSourceReader> {
            let stream = MFCreateFile(MF_ACCESSMODE_READ, MF_OPENMODE_FAIL_IF_NOT_EXIST, MF_FILEFLAGS_NONE, &HSTRING::from(path))?;
            stream.cast::<IMFAttributes>()?.SetString(&MF_BYTESTREAM_CONTENT_TYPE, w!("video/mp4"))?;
            MFCreateSourceReaderFromByteStream(&stream, None)
        };
        let Ok(reader) = open() else { return false };
        // The first reads may only report a type change before the picture comes.
        for _ in 0..PLAYABLE_READS {
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
// A write that fails midway keeps its frames only if the closed file plays; anything else is deleted.
// A finished file that cannot be renamed stays under its temporary name, as it is the only copy.
pub fn write(path: &str, clip: &Clip, video_type: &[u8], audio_type: Option<&[u8]>, frame: i64) -> std::result::Result<Outcome, String> {
    let partial = format!("{path}.part");
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let discard = |reason: String| {
        let _ = retry_while_busy(|| std::fs::remove_file(&partial));
        Err(reason)
    };
    let outcome = match write_to(&partial, clip, video_type, audio_type, frame) {
        Ok(outcome) => outcome,
        Err(error) => return discard(error.message()),
    };
    if matches!(outcome, Outcome::Partial { .. }) && !playable(&partial) {
        return discard("the frames written before the failure do not play".into());
    }
    match retry_while_busy(|| std::fs::rename(&partial, path)) {
        Ok(()) => Ok(outcome),
        Err(error) => Err(format!("{error}; the finished clip stays at {partial}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Foundation::E_FAIL;

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

    #[test]
    fn a_file_that_is_not_a_clip_does_not_play() {
        unsafe { MFStartup(MF_VERSION, MFSTARTUP_FULL).unwrap() };
        let path = std::env::temp_dir().join(format!("aw-clip-mux-{}.part", std::process::id()));
        std::fs::write(&path, b"not an mp4, only text").unwrap();
        assert!(!playable(path.to_str().unwrap()));
        assert!(!playable(path.with_extension("missing").to_str().unwrap()));
        std::fs::remove_file(&path).unwrap();
    }

    // Records the order of the packets and fails after a given number of writes.
    struct Recorder {
        written: Vec<(char, i64)>,
        fail_after: usize,
    }

    impl Recorder {
        fn take(&mut self, kind: char, time: i64) -> Result<()> {
            if self.written.len() >= self.fail_after {
                return Err(windows::core::Error::from_hresult(E_FAIL));
            }
            self.written.push((kind, time));
            Ok(())
        }
    }

    impl Sink for Recorder {
        fn video(&mut self, packet: &Packet, _duration: i64) -> Result<()> {
            self.take('v', packet.time)
        }

        fn audio(&mut self, packet: &Packet) -> Result<()> {
            self.take('a', packet.time)
        }
    }

    fn packet(time: i64) -> Packet {
        Packet { time, duration: SECOND / 10, key: true, data: vec![0; 4] }
    }

    fn clip() -> Clip {
        Clip { video: (0..4).map(|i| packet(i * SECOND / 10)).collect(), audio: (0..4).map(|i| packet(i * SECOND / 10 + 1)).collect() }
    }

    #[test]
    fn packets_go_out_in_time_order() {
        let mut sink = Recorder { written: Vec::new(), fail_after: usize::MAX };
        let (frames, failure) = copy_packets(&clip(), true, SECOND / 10, &mut sink);
        assert_eq!(frames, 4);
        assert!(failure.is_none());
        let kinds: String = sink.written.iter().map(|(kind, _)| *kind).collect();
        assert_eq!(kinds, "vavavava");
    }

    #[test]
    fn a_clip_without_sound_writes_only_video() {
        let mut sink = Recorder { written: Vec::new(), fail_after: usize::MAX };
        copy_packets(&clip(), false, SECOND / 10, &mut sink);
        assert!(sink.written.iter().all(|(kind, _)| *kind == 'v'));
        assert_eq!(sink.written.len(), 4);
    }

    #[test]
    fn a_failure_reports_the_frames_that_made_it_out() {
        let mut sink = Recorder { written: Vec::new(), fail_after: 5 };
        let (frames, failure) = copy_packets(&clip(), true, SECOND / 10, &mut sink);
        assert_eq!(frames, 3, "v a v a v went out, the next audio packet failed");
        assert!(failure.is_some());
    }
}
