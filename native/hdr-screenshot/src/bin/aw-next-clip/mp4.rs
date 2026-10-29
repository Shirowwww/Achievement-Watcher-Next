// The MP4 file itself (ISO/IEC 14496-12): the index first, so a clip starts playing before it is
// read to the end (a shared link, a preview), then one media box with video and audio interleaved
// half a second at a time. Sample times are kept as recorded, so a variable frame rate stays exact.
use std::io::{self, Write};

use crate::codec::{Codec, Config};
use crate::ring::{Packet, SECOND};

// 90 kHz divides every common frame rate, so frame durations are exact or one tick off.
const VIDEO_TIMESCALE: u32 = 90_000;
const MOVIE_TIMESCALE: u32 = 1000;
const INTERLEAVE: i64 = SECOND / 2;
// Seconds from 1904, where MP4 times start, to 1970.
const MP4_EPOCH: u64 = 2_082_844_800;
const AAC_FRAME: u32 = 1024;

#[derive(Clone, Copy)]
pub struct Color {
    pub primaries: u16,
    pub transfer: u16,
    pub matrix: u16,
    pub full_range: bool,
}

pub struct Video<'a> {
    pub config: &'a Config,
    pub width: u32,
    pub height: u32,
    pub color: Option<Color>,
    pub packets: &'a [Packet],
    // How long the last frame lasts when the encoder did not say.
    pub frame: i64,
}

pub struct Audio<'a> {
    pub rate: u32,
    pub channels: u16,
    // The AudioSpecificConfig of the AAC stream.
    pub specific: &'a [u8],
    pub packets: &'a [Packet],
}

// One track's sample tables.
struct Table {
    timescale: u32,
    sizes: Vec<u32>,
    durations: Vec<u32>,
    // 1-based numbers of the sync samples; None when every sample is one.
    sync: Option<Vec<u32>>,
    // When the track starts on the movie timeline, in its own timescale.
    offset: u32,
}

impl Table {
    fn new(packets: &[Packet], timescale: u32, last: i64, size: impl Fn(&Packet) -> usize) -> io::Result<Self> {
        // A clip lasts a minute at most, so the product stays far inside an i64.
        let ticks = |time: i64| (time * i64::from(timescale) + SECOND / 2).div_euclid(SECOND);
        let start = packets.first().map_or(0, |p| p.time);
        let mut durations = Vec::with_capacity(packets.len());
        for (i, packet) in packets.iter().enumerate() {
            let duration = match packets.get(i + 1) {
                Some(next) => ticks(next.time - start) - ticks(packet.time - start),
                None => ticks(if packet.duration > 0 { packet.duration } else { last }),
            };
            durations.push(duration.clamp(1, i64::from(u32::MAX)) as u32);
        }
        let sizes = packets.iter().map(|p| u32::try_from(size(p)).map_err(|_| io::Error::other("sample too large"))).collect::<io::Result<Vec<u32>>>()?;
        let sync = (!packets.iter().all(|p| p.key)).then(|| packets.iter().enumerate().filter(|(_, p)| p.key).map(|(i, _)| i as u32 + 1).collect());
        let offset = ticks(start).clamp(0, i64::from(u32::MAX)) as u32;
        Ok(Self { timescale, sizes, durations, sync, offset })
    }

    fn media_duration(&self) -> u64 {
        self.durations.iter().map(|&d| u64::from(d)).sum()
    }

    // In the movie timescale, from the start of the movie.
    fn movie_duration(&self) -> u64 {
        (u64::from(self.offset) + self.media_duration()) * u64::from(MOVIE_TIMESCALE) / u64::from(self.timescale)
    }
}

struct Chunk {
    track: usize,
    first: usize,
    count: usize,
    offset: u64,
}

// Each track's samples cut into half-second chunks, laid out one after the other in time order.
fn chunks(times: &[Vec<i64>], sizes: &[&[u32]]) -> Vec<Chunk> {
    let mut cursors = vec![0; times.len()];
    let mut list = Vec::new();
    let mut offset = 0u64;
    let mut boundary = INTERLEAVE;
    while cursors.iter().zip(times).any(|(&cursor, track)| cursor < track.len()) {
        for (track, track_times) in times.iter().enumerate() {
            let first = cursors[track];
            let count = track_times[first..].iter().take_while(|&&t| t < boundary).count();
            if count > 0 {
                list.push(Chunk { track, first, count, offset });
                offset += sizes[track][first..first + count].iter().map(|&s| u64::from(s)).sum::<u64>();
                cursors[track] += count;
            }
        }
        boundary += INTERLEAVE;
    }
    list
}

fn boxed(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(body.len() + 8);
    out.extend_from_slice(&(body.len() as u32 + 8).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(body);
    out
}

fn full(kind: &[u8; 4], flags: u32, body: &[u8]) -> Vec<u8> {
    let mut content = flags.to_be_bytes().to_vec();
    content.extend_from_slice(body);
    boxed(kind, &content)
}

// A box made of other boxes.
fn group(kind: &[u8; 4], children: &[Vec<u8>]) -> Vec<u8> {
    boxed(kind, &children.concat())
}

trait Put {
    fn u16(&mut self, value: u16) -> &mut Self;
    fn u32(&mut self, value: u32) -> &mut Self;
    fn zeros(&mut self, count: usize) -> &mut Self;
}

impl Put for Vec<u8> {
    fn u16(&mut self, value: u16) -> &mut Self {
        self.extend_from_slice(&value.to_be_bytes());
        self
    }
    fn u32(&mut self, value: u32) -> &mut Self {
        self.extend_from_slice(&value.to_be_bytes());
        self
    }
    fn zeros(&mut self, count: usize) -> &mut Self {
        self.resize(self.len() + count, 0);
        self
    }
}

const MATRIX: [u32; 9] = [0x0001_0000, 0, 0, 0, 0x0001_0000, 0, 0, 0, 0x4000_0000];

fn matrix(out: &mut Vec<u8>) {
    for value in MATRIX {
        out.u32(value);
    }
}

fn ftyp(codec: Codec) -> Vec<u8> {
    let mut body = b"isom".to_vec();
    body.u32(0x200);
    body.extend_from_slice(b"isomiso2mp41");
    match codec {
        Codec::H264 => body.extend_from_slice(b"avc1"),
        Codec::Hevc => {}
        // AV1-ISOBMFF 2.1 asks for its brand and a structural one.
        Codec::Av1 => body.extend_from_slice(b"iso6av01"),
    }
    boxed(b"ftyp", &body)
}

fn video_entry(video: &Video) -> Vec<u8> {
    let (fourcc, config) = match video.config.codec {
        Codec::H264 => (b"avc1", b"avcC"),
        Codec::Hevc => (b"hvc1", b"hvcC"),
        Codec::Av1 => (b"av01", b"av1C"),
    };
    let mut body = Vec::new();
    body.zeros(6).u16(1).zeros(16);
    body.u16(video.width as u16).u16(video.height as u16);
    body.u32(0x0048_0000).u32(0x0048_0000).u32(0).u16(1).zeros(32).u16(0x18).u16(0xffff);
    body.extend(boxed(config, &video.config.record));
    if let Some(color) = &video.color {
        let mut colr = b"nclx".to_vec();
        colr.u16(color.primaries).u16(color.transfer).u16(color.matrix);
        colr.push(if color.full_range { 0x80 } else { 0 });
        body.extend(boxed(b"colr", &colr));
    }
    boxed(fourcc, &body)
}

// ISO/IEC 14496-1 descriptors; every length here fits the one-byte form.
fn descriptor(tag: u8, body: &[u8]) -> Vec<u8> {
    let mut out = vec![tag, body.len() as u8];
    out.extend_from_slice(body);
    out
}

fn audio_entry(audio: &Audio, table: &Table) -> Vec<u8> {
    let seconds = table.media_duration() as f64 / f64::from(table.timescale);
    let bytes: u64 = table.sizes.iter().map(|&s| u64::from(s)).sum();
    let average = if seconds > 0.0 { (bytes as f64 * 8.0 / seconds) as u32 } else { 0 };
    let largest = table.sizes.iter().copied().max().unwrap_or(0);
    let mut config = vec![0x40, 0x15];
    config.extend_from_slice(&largest.to_be_bytes()[1..]);
    config.u32(average.max(peak_bitrate(table))).u32(average);
    config.extend(descriptor(0x05, audio.specific));
    let mut es = Vec::new();
    es.u16(0).push(0);
    es.extend(descriptor(0x04, &config));
    es.extend(descriptor(0x06, &[0x02]));

    let mut body = Vec::new();
    body.zeros(6).u16(1).zeros(8);
    body.u16(audio.channels).u16(16).u16(0).u16(0).u32(audio.rate.min(0xffff) << 16);
    body.extend(full(b"esds", 0, &descriptor(0x03, &es)));
    boxed(b"mp4a", &body)
}

// The most bits that went out in any one second.
fn peak_bitrate(table: &Table) -> u32 {
    let (mut peak, mut window, mut elapsed, mut first) = (0u64, 0u64, 0u64, 0usize);
    for (&size, &duration) in table.sizes.iter().zip(&table.durations) {
        window += u64::from(size);
        elapsed += u64::from(duration);
        while elapsed > u64::from(table.timescale) {
            window -= u64::from(table.sizes[first]);
            elapsed -= u64::from(table.durations[first]);
            first += 1;
        }
        peak = peak.max(window * 8);
    }
    peak.min(u64::from(u32::MAX)) as u32
}

// Where the media box starts in the file, and whether chunk offsets need 64 bits.
#[derive(Clone, Copy)]
struct Placement {
    base: u64,
    wide: bool,
}

fn sample_tables(table: &Table, chunks: &[Chunk], track: usize, place: Placement) -> Vec<Vec<u8>> {
    let Placement { base, wide } = place;
    let mut stts = Vec::new();
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for &duration in &table.durations {
        match runs.last_mut() {
            Some((count, last)) if *last == duration => *count += 1,
            _ => runs.push((1, duration)),
        }
    }
    stts.u32(runs.len() as u32);
    for (count, duration) in runs {
        stts.u32(count).u32(duration);
    }

    let mut stsz = Vec::new();
    match table.sizes.first() {
        Some(&size) if table.sizes.iter().all(|&s| s == size) => {
            stsz.u32(size).u32(table.sizes.len() as u32);
        }
        _ => {
            stsz.u32(0).u32(table.sizes.len() as u32);
            for &size in &table.sizes {
                stsz.u32(size);
            }
        }
    }

    let own: Vec<&Chunk> = chunks.iter().filter(|c| c.track == track).collect();
    let mut stsc = Vec::new();
    let mut entries: Vec<(u32, u32)> = Vec::new();
    for (i, chunk) in own.iter().enumerate() {
        if entries.last().is_none_or(|&(_, count)| count != chunk.count as u32) {
            entries.push((i as u32 + 1, chunk.count as u32));
        }
    }
    stsc.u32(entries.len() as u32);
    for (first, count) in entries {
        stsc.u32(first).u32(count).u32(1);
    }

    let mut offsets = Vec::new();
    offsets.u32(own.len() as u32);
    for chunk in &own {
        let offset = base + chunk.offset;
        if wide {
            offsets.extend_from_slice(&offset.to_be_bytes());
        } else {
            offsets.u32(offset as u32);
        }
    }

    let mut boxes = vec![full(b"stts", 0, &stts)];
    // A track that starts after the movie does (the sound, by a few milliseconds) is shifted with a
    // composition offset, as Windows' own writer does: its player ignores an empty edit list.
    if table.offset > 0 {
        let mut ctts = Vec::new();
        ctts.u32(1).u32(table.sizes.len() as u32).u32(table.offset);
        boxes.push(full(b"ctts", 0, &ctts));
    }
    if let Some(sync) = &table.sync {
        let mut stss = Vec::new();
        stss.u32(sync.len() as u32);
        for &number in sync {
            stss.u32(number);
        }
        boxes.push(full(b"stss", 0, &stss));
    }
    boxes.push(full(b"stsz", 0, &stsz));
    boxes.push(full(b"stsc", 0, &stsc));
    boxes.push(full(if wide { b"co64" } else { b"stco" }, 0, &offsets));
    boxes
}

struct Track {
    table: Table,
    entry: Vec<u8>,
    sound: bool,
    // Display size; zero for sound.
    size: (u32, u32),
}

fn trak(track: &Track, index: usize, created: u32, chunks: &[Chunk], place: Placement) -> Vec<u8> {
    let table = &track.table;
    let mut tkhd = Vec::new();
    tkhd.u32(created).u32(created).u32(index as u32 + 1).u32(0).u32(table.movie_duration() as u32).zeros(8);
    tkhd.u16(0).u16(0).u16(if track.sound { 0x0100 } else { 0 }).u16(0);
    matrix(&mut tkhd);
    tkhd.u32(track.size.0 << 16).u32(track.size.1 << 16);

    let mut children = vec![full(b"tkhd", 3, &tkhd)];

    let mut mdhd = Vec::new();
    mdhd.u32(created).u32(created).u32(table.timescale).u32(table.media_duration() as u32).u16(0x55c4).u16(0);
    let mut hdlr = Vec::new();
    hdlr.u32(0).extend_from_slice(if track.sound { b"soun" } else { b"vide" });
    hdlr.zeros(12).extend_from_slice(if track.sound { b"SoundHandler\0" } else { b"VideoHandler\0" });
    let header = if track.sound { full(b"smhd", 0, &[0; 4]) } else { full(b"vmhd", 1, &[0; 8]) };
    let mut dref = Vec::new();
    dref.u32(1).extend(full(b"url ", 1, &[]));
    let mut stsd = Vec::new();
    stsd.u32(1).extend_from_slice(&track.entry);
    let mut stbl = vec![full(b"stsd", 0, &stsd)];
    stbl.extend(sample_tables(table, chunks, index, place));
    let minf = group(b"minf", &[header, group(b"dinf", &[full(b"dref", 0, &dref)]), group(b"stbl", &stbl)]);
    children.push(group(b"mdia", &[full(b"mdhd", 0, &mdhd), full(b"hdlr", 0, &hdlr), minf]));
    group(b"trak", &children)
}

fn moov(tracks: &[Track], chunks: &[Chunk], created: u32, place: Placement) -> Vec<u8> {
    let duration = tracks.iter().map(|t| t.table.movie_duration()).max().unwrap_or(0);
    let mut mvhd = Vec::new();
    mvhd.u32(created).u32(created).u32(MOVIE_TIMESCALE).u32(duration as u32).u32(0x0001_0000).u16(0x0100).zeros(10);
    matrix(&mut mvhd);
    mvhd.zeros(24).u32(tracks.len() as u32 + 1);
    let mut children = vec![full(b"mvhd", 0, &mvhd)];
    children.extend(tracks.iter().enumerate().map(|(index, track)| trak(track, index, created, chunks, place)));
    group(b"moov", &children)
}

// `created` is in seconds since 1970; the file stores it from 1904.
pub fn write(out: &mut dyn Write, video: &Video, audio: Option<&Audio>, created: u64) -> io::Result<()> {
    let created = (created + MP4_EPOCH).min(u64::from(u32::MAX)) as u32;
    let config = video.config;
    let mut tracks = vec![Track {
        table: Table::new(video.packets, VIDEO_TIMESCALE, video.frame, |p| config.sample_size(&p.data, p.key))?,
        entry: video_entry(video),
        sound: false,
        size: (video.width, video.height),
    }];
    let audio = audio.filter(|a| !a.packets.is_empty());
    if let Some(audio) = audio {
        let table = Table::new(audio.packets, audio.rate, i64::from(AAC_FRAME) * SECOND / i64::from(audio.rate.max(1)), |p| p.data.len())?;
        let entry = audio_entry(audio, &table);
        tracks.push(Track { table, entry, sound: true, size: (0, 0) });
    }
    let mut times = vec![video.packets.iter().map(|p| p.time).collect::<Vec<_>>()];
    times.extend(audio.map(|a| a.packets.iter().map(|p| p.time).collect()));
    let sizes: Vec<&[u32]> = tracks.iter().map(|t| t.table.sizes.as_slice()).collect();
    let chunks = chunks(&times, &sizes);
    let payload: u64 = sizes.iter().flat_map(|s| s.iter()).map(|&s| u64::from(s)).sum();

    // The offsets of the index point past the index itself, and their width can change its length.
    let ftyp = ftyp(config.codec);
    let mdat_header = if payload + 8 > u64::from(u32::MAX) { 16 } else { 8 };
    let narrow = moov(&tracks, &chunks, created, Placement { base: 0, wide: false }).len() as u64;
    let wide = ftyp.len() as u64 + narrow + mdat_header + payload > u64::from(u32::MAX);
    let length = moov(&tracks, &chunks, created, Placement { base: 0, wide }).len() as u64;
    let index = moov(&tracks, &chunks, created, Placement { base: ftyp.len() as u64 + length + mdat_header, wide });

    out.write_all(&ftyp)?;
    out.write_all(&index)?;
    if mdat_header == 16 {
        out.write_all(&1u32.to_be_bytes())?;
        out.write_all(b"mdat")?;
        out.write_all(&(payload + 16).to_be_bytes())?;
    } else {
        out.write_all(&(payload as u32 + 8).to_be_bytes())?;
        out.write_all(b"mdat")?;
    }
    for chunk in &chunks {
        for i in chunk.first..chunk.first + chunk.count {
            if chunk.track == 0 {
                let packet = &video.packets[i];
                config.write_sample(&packet.data, packet.key, out)?;
            } else if let Some(audio) = audio {
                out.write_all(&audio.packets[i].data)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const H264_HEADER: [u8; 18] = [0, 0, 0, 1, 0x67, 0x42, 0, 0x1e, 0xab, 0, 0, 0, 1, 0x68, 0xce, 0x38, 0x80, 0];

    fn packet(time: i64, key: bool, data: Vec<u8>) -> Packet {
        Packet { time, duration: 0, key, data }
    }

    // Reads back what a player reads: the box tree, then each track's sample tables.
    struct Parsed {
        file: Vec<u8>,
    }

    impl Parsed {
        fn find(&self, path: &[&[u8; 4]]) -> Vec<(usize, usize)> {
            let mut spans = vec![(0, self.file.len())];
            for kind in path {
                let mut next = Vec::new();
                for (start, end) in spans {
                    let mut at = start;
                    while at + 8 <= end {
                        let size = u32::from_be_bytes(self.file[at..at + 4].try_into().unwrap()) as usize;
                        if &self.file[at + 4..at + 8] == *kind {
                            next.push((at + 8, at + size));
                        }
                        at += size.max(8);
                    }
                }
                spans = next;
            }
            spans
        }

        fn u32_at(&self, at: usize) -> u32 {
            u32::from_be_bytes(self.file[at..at + 4].try_into().unwrap())
        }

        // (count, value) pairs of a table box whose entries are two u32 each, after version and count.
        fn pairs(&self, span: (usize, usize)) -> Vec<(u32, u32)> {
            let count = self.u32_at(span.0 + 4) as usize;
            (0..count).map(|i| (self.u32_at(span.0 + 8 + i * 8), self.u32_at(span.0 + 12 + i * 8))).collect()
        }

        // The bytes of every sample of a track, through stsc, stco and stsz as a player finds them.
        fn samples(&self, trak: (usize, usize)) -> Vec<Vec<u8>> {
            let within = |kind: &[u8; 4]| self.find(&[b"moov", b"trak", b"mdia", b"minf", b"stbl", kind]).into_iter().find(|s| s.0 > trak.0 && s.1 <= trak.1).unwrap();
            let stsz = within(b"stsz");
            let fixed = self.u32_at(stsz.0 + 4);
            let count = self.u32_at(stsz.0 + 8) as usize;
            let sizes: Vec<u32> = (0..count).map(|i| if fixed > 0 { fixed } else { self.u32_at(stsz.0 + 12 + i * 4) }).collect();
            let stco = within(b"stco");
            let offsets: Vec<u32> = (0..self.u32_at(stco.0 + 4) as usize).map(|i| self.u32_at(stco.0 + 8 + i * 4)).collect();
            let stsc: Vec<(u32, u32)> = {
                let span = within(b"stsc");
                (0..self.u32_at(span.0 + 4) as usize).map(|i| (self.u32_at(span.0 + 8 + i * 12), self.u32_at(span.0 + 12 + i * 12))).collect()
            };
            let mut out = Vec::new();
            let mut sample = 0;
            for (chunk, &offset) in offsets.iter().enumerate() {
                let per = stsc.iter().rev().find(|(first, _)| *first as usize <= chunk + 1).unwrap().1;
                let mut at = offset as usize;
                for _ in 0..per {
                    out.push(self.file[at..at + sizes[sample] as usize].to_vec());
                    at += sizes[sample] as usize;
                    sample += 1;
                }
            }
            out
        }
    }

    fn written(video: &Video, audio: Option<&Audio>) -> Parsed {
        let mut file = Vec::new();
        write(&mut file, video, audio, 0).unwrap();
        Parsed { file }
    }

    fn sixty_fps(frames: i64) -> Vec<Packet> {
        (0..frames).map(|i| packet(i * SECOND / 60, i % 60 == 0, vec![0, 0, 0, 1, 0x65, i as u8])).collect()
    }

    fn sound(first: i64, frames: i64) -> Vec<Packet> {
        (0..frames).map(|i| packet(first + i * 1024 * SECOND / 48000, true, vec![0x21, i as u8, 7])).collect()
    }

    fn clip<'a>(config: &'a Config, packets: &'a [Packet]) -> Video<'a> {
        Video { config, width: 1920, height: 1080, color: Some(Color { primaries: 1, transfer: 1, matrix: 1, full_range: false }), packets, frame: SECOND / 60 }
    }

    fn aac(packets: &[Packet]) -> Audio<'_> {
        Audio { rate: 48000, channels: 2, specific: &[0x11, 0x90], packets }
    }

    #[test]
    fn the_index_comes_first_and_every_sample_is_where_it_says() {
        let config = Config::new(Codec::H264, &H264_HEADER, &[]).unwrap();
        let video = sixty_fps(150);
        let sound = sound(SECOND / 100, 110);
        let parsed = written(&clip(&config, &video), Some(&aac(&sound)));
        let top: Vec<&[u8]> = [b"ftyp", b"moov", b"mdat"].iter().map(|k| &k[..]).collect();
        let order: Vec<&[u8]> = {
            let mut at = 0;
            let mut kinds = Vec::new();
            while at < parsed.file.len() {
                kinds.push(&parsed.file[at + 4..at + 8]);
                at += parsed.u32_at(at) as usize;
            }
            kinds
        };
        assert_eq!(order, top);
        let traks = parsed.find(&[b"moov", b"trak"]);
        assert_eq!(traks.len(), 2);
        let frames = parsed.samples(traks[0]);
        assert_eq!(frames.len(), 150);
        assert_eq!(frames[42], vec![0, 0, 0, 2, 0x65, 42], "Annex B became a length prefix");
        let audio = parsed.samples(traks[1]);
        assert_eq!(audio.len(), 110);
        assert_eq!(audio[77], vec![0x21, 77, 7]);
    }

    #[test]
    fn frame_times_survive_a_variable_rate() {
        let config = Config::new(Codec::H264, &H264_HEADER, &[]).unwrap();
        let times = [0, SECOND / 60, SECOND / 30, SECOND / 10, SECOND / 10 + SECOND / 144];
        let video: Vec<Packet> = times.iter().enumerate().map(|(i, &t)| packet(t, i == 0, vec![0, 0, 1, 0x65, 1])).collect();
        let parsed = written(&clip(&config, &video), None);
        let stts = parsed.find(&[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"stts"])[0];
        assert_eq!(parsed.pairs(stts), vec![(2, 1500), (1, 6000), (1, 625), (1, 1500)], "ticks of 90 kHz; the last frame lasts one frame");
        let stss = parsed.find(&[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"stss"])[0];
        assert_eq!((parsed.u32_at(stss.0 + 4), parsed.u32_at(stss.0 + 8)), (1, 1), "only the first frame is a keyframe");
    }

    #[test]
    fn sound_that_starts_late_is_shifted_by_a_composition_offset() {
        let config = Config::new(Codec::H264, &H264_HEADER, &[]).unwrap();
        let video = sixty_fps(60);
        let sound = sound(SECOND / 4, 30);
        let parsed = written(&clip(&config, &video), Some(&aac(&sound)));
        let ctts = parsed.find(&[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"ctts"]);
        assert_eq!(ctts.len(), 1, "only the sound track has one");
        assert_eq!(parsed.pairs(ctts[0]), vec![(30, 12000)], "every sound frame plays 250 ms later");
        assert!(parsed.find(&[b"moov", b"trak", b"edts"]).is_empty(), "Windows' player ignores an empty edit");
        let mdhd = parsed.find(&[b"moov", b"trak", b"mdia", b"mdhd"])[1];
        assert_eq!((parsed.u32_at(mdhd.0 + 12), parsed.u32_at(mdhd.0 + 16)), (48000, 30 * 1024));
    }

    #[test]
    fn chunks_hold_half_a_second_of_one_track_in_time_order() {
        let times = vec![(0..60).map(|i| i * SECOND / 60).collect::<Vec<_>>(), (0..47).map(|i| i * 1024 * SECOND / 48000).collect()];
        let sizes: Vec<Vec<u32>> = times.iter().map(|t| vec![10; t.len()]).collect();
        let list = chunks(&times, &sizes.iter().map(Vec::as_slice).collect::<Vec<_>>());
        let shape: Vec<(usize, usize)> = list.iter().map(|c| (c.track, c.count)).collect();
        assert_eq!(shape, vec![(0, 30), (1, 24), (0, 30), (1, 23)]);
        assert_eq!(list[1].offset, 300);
        assert_eq!(list[3].offset, 840);
    }

    #[test]
    fn the_sample_entry_carries_the_codec_record_and_the_colours() {
        let config = Config::new(Codec::H264, &H264_HEADER, &[]).unwrap();
        let video = sixty_fps(2);
        let parsed = written(&clip(&config, &video), None);
        let entry = parsed.find(&[b"moov", b"trak", b"mdia", b"minf", b"stbl", b"stsd"])[0];
        let avc1 = &parsed.file[entry.0 + 8..entry.1];
        assert_eq!(&avc1[4..8], b"avc1");
        assert_eq!(u16::from_be_bytes([avc1[32], avc1[33]]), 1920);
        let colr = avc1.windows(4).position(|w| w == b"colr").unwrap();
        assert_eq!(&avc1[colr + 4..colr + 15], b"nclx\0\x01\0\x01\0\x01\0");
        assert!(avc1.windows(4).any(|w| w == b"avcC"));
        let ftyp = parsed.find(&[b"ftyp"])[0];
        assert!(parsed.file[ftyp.0..ftyp.1].windows(4).any(|w| w == b"avc1"));
    }
}
