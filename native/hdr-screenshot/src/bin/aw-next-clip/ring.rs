// The last few seconds of encoded video and audio, and the clips waiting for their end to arrive.
use std::collections::VecDeque;

// Media Foundation time: 100 ns ticks, taken from the performance counter so video and audio agree.
pub const SECOND: i64 = 10_000_000;

#[derive(Clone, Debug, PartialEq)]
pub struct Packet {
    pub time: i64,
    pub duration: i64,
    pub key: bool,
    pub data: Vec<u8>,
}

pub struct Clip {
    pub video: Vec<Packet>,
    pub audio: Vec<Packet>,
}

pub struct Ring {
    video: VecDeque<Packet>,
    audio: VecDeque<Packet>,
    keep: i64,
    max_bytes: usize,
    bytes: usize,
}

impl Ring {
    pub fn new(keep: i64, max_bytes: usize) -> Self {
        Self { video: VecDeque::new(), audio: VecDeque::new(), keep, max_bytes, bytes: 0 }
    }

    pub fn push_video(&mut self, packet: Packet) {
        self.bytes += packet.data.len();
        self.video.push_back(packet);
        self.trim_video();
    }

    pub fn push_audio(&mut self, packet: Packet) {
        let newest = packet.time;
        self.audio.push_back(packet);
        while self.audio.front().is_some_and(|p| p.time < newest - self.keep - SECOND) {
            self.audio.pop_front();
        }
    }

    // A new resolution or format starts a new stream: older packets cannot be decoded with it.
    pub fn clear_video(&mut self) {
        self.video.clear();
        self.bytes = 0;
    }

    pub fn video_bytes(&self) -> usize {
        self.bytes
    }

    fn pop_video(&mut self) {
        if let Some(p) = self.video.pop_front() {
            self.bytes -= p.data.len();
        }
    }

    // Whole groups of pictures go at once, so the ring always starts on a keyframe.
    fn trim_video(&mut self) {
        let Some(newest) = self.video.back().map(|p| p.time) else { return };
        if let Some(cut) = self.video.iter().rposition(|p| p.key && p.time <= newest - self.keep) {
            for _ in 0..cut {
                self.pop_video();
            }
        }
        while self.bytes > self.max_bytes && self.video.len() > 1 {
            self.pop_video();
            while self.video.front().is_some_and(|p| !p.key) {
                self.pop_video();
            }
        }
    }

    // Video from the keyframe at or before `start`, audio over the same span, both rebased to zero.
    pub fn select(&self, start: i64, end: i64) -> Option<Clip> {
        let first = self
            .video
            .iter()
            .rposition(|p| p.key && p.time <= start)
            .or_else(|| self.video.iter().position(|p| p.key))?;
        let origin = self.video[first].time;
        let rebase = |p: &Packet| Packet { time: p.time - origin, ..p.clone() };
        let video: Vec<Packet> = self.video.iter().skip(first).take_while(|p| p.time <= end).map(rebase).collect();
        let audio = self.audio.iter().filter(|p| p.time >= origin && p.time <= end).map(rebase).collect();
        Some(Clip { video, audio })
    }
}

pub struct Job {
    pub start: i64,
    pub end: i64,
    pub path: String,
}

// Unlocks close together share one clip instead of writing near-identical copies.
pub struct Schedule {
    jobs: VecDeque<Job>,
    max_length: i64,
}

impl Schedule {
    pub fn new(max_length: i64) -> Self {
        Self { jobs: VecDeque::new(), max_length }
    }

    // Returns the clip an unlock was folded into, when it lands before that clip has ended.
    pub fn add(&mut self, anchor: i64, before: i64, after: i64, path: String) -> Option<String> {
        if let Some(last) = self.jobs.back_mut() {
            if anchor <= last.end {
                last.end = last.end.max(anchor + after).min(last.start + self.max_length);
                return Some(last.path.clone());
            }
        }
        self.jobs.push_back(Job { start: anchor - before, end: anchor + after, path });
        None
    }

    pub fn take_due(&mut self, now: i64) -> Option<Job> {
        if self.jobs.front().is_some_and(|job| job.end <= now) {
            return self.jobs.pop_front();
        }
        None
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn packet(time: i64, key: bool) -> Packet {
        Packet { time, duration: SECOND / 10, key, data: vec![0; 100] }
    }

    // Ten frames per second with a keyframe every second, from 0 to `seconds`.
    fn filled(seconds: i64, keep: i64) -> Ring {
        let mut ring = Ring::new(keep * SECOND, usize::MAX);
        for i in 0..seconds * 10 {
            ring.push_video(packet(i * SECOND / 10, i % 10 == 0));
            ring.push_audio(packet(i * SECOND / 10 + 1, true));
        }
        ring
    }

    #[test]
    fn the_ring_keeps_whole_groups_of_pictures() {
        let ring = filled(30, 10);
        let first = ring.video.front().unwrap();
        assert!(first.key, "the oldest packet is a keyframe");
        assert_eq!(first.time, 19 * SECOND, "the newest frame is 29.9 s, so 10 s back lands in the GOP starting at 19 s");
        assert!(ring.audio.front().unwrap().time >= 18 * SECOND);
    }

    #[test]
    fn a_clip_starts_on_the_keyframe_before_its_start_and_is_rebased() {
        let ring = filled(30, 20);
        let clip = ring.select(15 * SECOND + SECOND / 2, 25 * SECOND).unwrap();
        assert_eq!(clip.video[0].time, 0);
        assert!(clip.video[0].key);
        assert_eq!(clip.video.len(), 101, "15.0 s to 25.0 s inclusive at 10 fps");
        assert!(clip.audio.iter().all(|p| p.time >= 0 && p.time <= 10 * SECOND));
    }

    #[test]
    fn a_clip_older_than_the_ring_starts_at_the_first_keyframe() {
        let ring = filled(5, 20);
        let clip = ring.select(-30 * SECOND, 4 * SECOND).unwrap();
        assert_eq!(clip.video.len(), 41);
    }

    #[test]
    fn the_byte_cap_drops_whole_groups_of_pictures() {
        let mut ring = Ring::new(60 * SECOND, 1000);
        for i in 0..40 {
            ring.push_video(packet(i * SECOND / 10, i % 10 == 0));
        }
        assert!(ring.video_bytes() <= 1000);
        assert!(ring.video.front().unwrap().key);
    }

    #[test]
    fn a_new_stream_empties_the_video() {
        let mut ring = filled(3, 10);
        ring.clear_video();
        assert!(ring.select(0, SECOND).is_none());
        assert_eq!(ring.video_bytes(), 0);
    }

    #[test]
    fn close_unlocks_share_one_clip_and_far_ones_get_their_own() {
        let mut schedule = Schedule::new(60 * SECOND);
        assert_eq!(schedule.add(100 * SECOND, 10 * SECOND, 10 * SECOND, "a".into()), None);
        assert_eq!(schedule.add(104 * SECOND, 10 * SECOND, 10 * SECOND, "b".into()), Some("a".into()));
        assert_eq!(schedule.jobs[0].end, 114 * SECOND);
        assert_eq!(schedule.add(200 * SECOND, 10 * SECOND, 10 * SECOND, "c".into()), None);
        assert!(schedule.take_due(113 * SECOND).is_none());
        assert_eq!(schedule.take_due(114 * SECOND).unwrap().path, "a");
        assert!(schedule.take_due(150 * SECOND).is_none());
        assert!(!schedule.is_empty());
    }

    #[test]
    fn a_shared_clip_never_grows_past_its_cap() {
        let mut schedule = Schedule::new(30 * SECOND);
        schedule.add(100 * SECOND, 10 * SECOND, 10 * SECOND, "a".into());
        for t in [105, 110, 115, 120, 125] {
            schedule.add(t * SECOND, 10 * SECOND, 10 * SECOND, "x".into());
        }
        let job = schedule.take_due(1000 * SECOND).unwrap();
        assert_eq!(job.end - job.start, 30 * SECOND);
    }
}
