// What the MP4 sample entry needs to know about each codec, read from the encoder's own parameter
// sets, and the cleanup every sample gets on its way into the file. H.264 and HEVC come out of Media
// Foundation as Annex B (start codes, an access unit delimiter, parameter sets on every keyframe) and
// go in as length-prefixed NAL units with the parameter sets in the avcC or hvcC box. AV1 goes in as
// OBUs without the temporal delimiter the encoder puts in front of every frame.
use std::io::{self, Write};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Codec {
    H264,
    Hevc,
    Av1,
}

pub struct Config {
    pub codec: Codec,
    // The body of the avcC, hvcC or av1C box.
    pub record: Vec<u8>,
    // NAL units the record carries: avc1 and hvc1 keep them out of the samples.
    in_record: Vec<Vec<u8>>,
    // AV1 only: every sync sample has to start with it.
    sequence_header: Vec<u8>,
}

const H264_SPS: u8 = 7;
const H264_PPS: u8 = 8;
const H264_AUD: u8 = 9;
const HEVC_VPS: u8 = 32;
const HEVC_SPS: u8 = 33;
const HEVC_PPS: u8 = 34;
const HEVC_AUD: u8 = 35;
const OBU_SEQUENCE_HEADER: u8 = 1;
const OBU_TEMPORAL_DELIMITER: u8 = 2;
const OBU_PADDING: u8 = 15;

impl Config {
    // `header` is the encoder's MF_MT_MPEG_SEQUENCE_HEADER; the parameter sets of the first keyframe
    // win over it, since they are the ones the samples were encoded with.
    pub fn new(codec: Codec, header: &[u8], first_key: &[u8]) -> Result<Self, String> {
        match codec {
            Codec::H264 => {
                let sps = parameter_set(codec, H264_SPS, first_key, header).ok_or("no H.264 sequence parameter set")?;
                let pps = parameter_set(codec, H264_PPS, first_key, header).ok_or("no H.264 picture parameter set")?;
                Ok(Self { codec, record: avcc(&sps, &pps)?, in_record: vec![sps, pps], sequence_header: Vec::new() })
            }
            Codec::Hevc => {
                let vps = parameter_set(codec, HEVC_VPS, first_key, header).ok_or("no HEVC video parameter set")?;
                let sps = parameter_set(codec, HEVC_SPS, first_key, header).ok_or("no HEVC sequence parameter set")?;
                let pps = parameter_set(codec, HEVC_PPS, first_key, header).ok_or("no HEVC picture parameter set")?;
                Ok(Self { codec, record: hvcc(&vps, &sps, &pps)?, in_record: vec![vps, sps, pps], sequence_header: Vec::new() })
            }
            Codec::Av1 => {
                let find = |data: &[u8]| obus(data).into_iter().find(|obu| obu_type(obu) == OBU_SEQUENCE_HEADER).map(<[u8]>::to_vec);
                let sequence_header = find(first_key).or_else(|| find(header)).ok_or("no AV1 sequence header")?;
                Ok(Self { codec, record: av1c(&sequence_header)?, in_record: Vec::new(), sequence_header })
            }
        }
    }

    // The NAL units or OBUs of a sample that go into the file, in order.
    fn pieces<'a>(&'a self, data: &'a [u8], key: bool) -> Vec<&'a [u8]> {
        match self.codec {
            Codec::H264 | Codec::Hevc => {
                let aud = if self.codec == Codec::H264 { H264_AUD } else { HEVC_AUD };
                nal_units(data).into_iter().filter(|unit| nal_type(self.codec, unit) != aud && !self.in_record.iter().any(|set| set == unit)).collect()
            }
            Codec::Av1 => {
                let mut kept: Vec<&[u8]> = obus(data).into_iter().filter(|obu| !matches!(obu_type(obu), OBU_TEMPORAL_DELIMITER | OBU_PADDING)).collect();
                if key && !kept.iter().any(|obu| obu_type(obu) == OBU_SEQUENCE_HEADER) {
                    kept.insert(0, &self.sequence_header);
                }
                kept
            }
        }
    }

    fn prefixed(&self) -> bool {
        self.codec != Codec::Av1
    }

    pub fn sample_size(&self, data: &[u8], key: bool) -> usize {
        let prefix = if self.prefixed() { 4 } else { 0 };
        self.pieces(data, key).iter().map(|piece| piece.len() + prefix).sum()
    }

    pub fn write_sample(&self, data: &[u8], key: bool, out: &mut dyn Write) -> io::Result<()> {
        for piece in self.pieces(data, key) {
            if self.prefixed() {
                out.write_all(&(piece.len() as u32).to_be_bytes())?;
            }
            out.write_all(piece)?;
        }
        Ok(())
    }
}

// Annex B: units start after 00 00 01; the zero of a four-byte start code and any trailing zero
// bytes belong to no unit, since a NAL unit always ends on its stop bit.
fn nal_units(data: &[u8]) -> Vec<&[u8]> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i + 2] > 1 {
            i += 3;
        } else if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            starts.push(i + 3);
            i += 3;
        } else {
            i += 1;
        }
    }
    if starts.is_empty() {
        return if data.is_empty() { Vec::new() } else { vec![data] };
    }
    let mut units = Vec::with_capacity(starts.len());
    for (k, &start) in starts.iter().enumerate() {
        let mut end = starts.get(k + 1).map_or(data.len(), |next| next - 3);
        while end > start && data[end - 1] == 0 {
            end -= 1;
        }
        if end > start {
            units.push(&data[start..end]);
        }
    }
    units
}

fn nal_type(codec: Codec, unit: &[u8]) -> u8 {
    match codec {
        Codec::Hevc => (unit[0] >> 1) & 0x3f,
        _ => unit[0] & 0x1f,
    }
}

fn parameter_set(codec: Codec, kind: u8, first: &[u8], second: &[u8]) -> Option<Vec<u8>> {
    let find = |data: &[u8]| nal_units(data).into_iter().find(|unit| nal_type(codec, unit) == kind).map(<[u8]>::to_vec);
    find(first).or_else(|| find(second))
}

fn leb128(data: &[u8]) -> (usize, usize) {
    let mut value = 0usize;
    for (i, byte) in data.iter().take(8).enumerate() {
        value |= usize::from(byte & 0x7f) << (7 * i);
        if byte & 0x80 == 0 {
            return (value, i + 1);
        }
    }
    (value, data.len().min(8))
}

// Whole OBUs, headers included. One without a size field runs to the end of the sample.
fn obus(data: &[u8]) -> Vec<&[u8]> {
    let mut list = Vec::new();
    let mut offset = 0;
    while offset < data.len() {
        let header = data[offset];
        let mut payload = (offset + 1 + usize::from(header & 4 != 0)).min(data.len());
        let end = if header & 2 != 0 {
            let (size, length) = leb128(&data[payload..]);
            payload += length;
            payload.saturating_add(size).min(data.len())
        } else {
            data.len()
        };
        list.push(&data[offset..end]);
        offset = end;
    }
    list
}

fn obu_type(obu: &[u8]) -> u8 {
    (obu[0] >> 3) & 0x0f
}

// Removes the emulation prevention bytes (00 00 03) so the fields can be read.
fn rbsp(unit: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(unit.len());
    let mut zeros = 0;
    for &byte in unit {
        if zeros >= 2 && byte == 3 {
            zeros = 0;
            continue;
        }
        zeros = if byte == 0 { zeros + 1 } else { 0 };
        out.push(byte);
    }
    out
}

// Reading past the end yields zeros; the callers check the values that matter.
struct Bits<'a> {
    data: &'a [u8],
    position: usize,
}

impl<'a> Bits<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, position: 0 }
    }

    fn bit(&mut self) -> u32 {
        let byte = self.data.get(self.position / 8).copied().unwrap_or(0);
        self.position += 1;
        u32::from((byte >> (7 - (self.position - 1) % 8)) & 1)
    }

    fn bits(&mut self, count: u32) -> u32 {
        (0..count).fold(0u64, |value, _| (value << 1) | u64::from(self.bit())) as u32
    }

    fn flag(&mut self) -> bool {
        self.bit() == 1
    }

    fn skip(&mut self, count: usize) {
        self.position += count;
    }

    // Exp-Golomb, as H.264 and HEVC write their ue(v) fields.
    fn ue(&mut self) -> u32 {
        let mut zeros = 0;
        while self.bit() == 0 && zeros < 32 {
            zeros += 1;
        }
        if zeros >= 32 { u32::MAX } else { (1u32 << zeros) - 1 + self.bits(zeros) }
    }
}

fn push_sized(out: &mut Vec<u8>, unit: &[u8]) -> Result<(), String> {
    let size = u16::try_from(unit.len()).map_err(|_| "parameter set too large")?;
    out.extend_from_slice(&size.to_be_bytes());
    out.extend_from_slice(unit);
    Ok(())
}

// ISO/IEC 14496-15 5.3.3.1. The High profiles also state their chroma format and bit depths.
fn avcc(sps: &[u8], pps: &[u8]) -> Result<Vec<u8>, String> {
    if sps.len() < 4 {
        return Err("H.264 sequence parameter set too short".into());
    }
    let mut record = vec![1, sps[1], sps[2], sps[3], 0xfc | 3, 0xe0 | 1];
    push_sized(&mut record, sps)?;
    record.push(1);
    push_sized(&mut record, pps)?;
    if matches!(sps[1], 100 | 110 | 122 | 144) {
        let fields = rbsp(&sps[4..]);
        let mut bits = Bits::new(&fields);
        bits.ue();
        let chroma_format = bits.ue();
        if chroma_format == 3 {
            bits.skip(1);
        }
        let luma_depth = bits.ue();
        let chroma_depth = bits.ue();
        record.extend_from_slice(&[0xfc | (chroma_format & 3) as u8, 0xf8 | (luma_depth & 7) as u8, 0xf8 | (chroma_depth & 7) as u8, 0]);
    }
    Ok(record)
}

// ISO/IEC 14496-15 8.3.3.1. The general profile, tier and level are copied as they are: they follow
// the first byte of the SPS and are byte aligned there.
fn hvcc(vps: &[u8], sps: &[u8], pps: &[u8]) -> Result<Vec<u8>, String> {
    let fields = rbsp(&sps[2.min(sps.len())..]);
    if fields.len() < 13 {
        return Err("HEVC sequence parameter set too short".into());
    }
    let mut bits = Bits::new(&fields);
    bits.skip(4);
    let sub_layers = bits.bits(3);
    let nested = bits.bit();
    bits.skip(12 * 8);
    let present: Vec<(bool, bool)> = (0..sub_layers).map(|_| (bits.flag(), bits.flag())).collect();
    if sub_layers > 0 {
        bits.skip(2 * (8 - sub_layers as usize));
    }
    for (profile, level) in present {
        bits.skip(if profile { 88 } else { 0 } + if level { 8 } else { 0 });
    }
    bits.ue();
    let chroma_format = bits.ue();
    if chroma_format == 3 {
        bits.skip(1);
    }
    bits.ue();
    bits.ue();
    if bits.flag() {
        (0..4).for_each(|_| {
            bits.ue();
        });
    }
    let luma_depth = bits.ue();
    let chroma_depth = bits.ue();

    let mut record = vec![1];
    record.extend_from_slice(&fields[1..13]);
    record.extend_from_slice(&[0xf0, 0x00, 0xfc, 0xfc | (chroma_format & 3) as u8, 0xf8 | (luma_depth & 7) as u8, 0xf8 | (chroma_depth & 7) as u8, 0, 0]);
    // No constant frame rate is promised, four-byte NAL lengths.
    record.push((((sub_layers + 1) << 3) | (nested << 2) | 3) as u8);
    record.push(3);
    for (kind, unit) in [(HEVC_VPS, vps), (HEVC_SPS, sps), (HEVC_PPS, pps)] {
        record.extend_from_slice(&[0x80 | kind, 0, 1]);
        push_sized(&mut record, unit)?;
    }
    Ok(record)
}

// AV1-ISOBMFF 2.3: the fields of the sequence header that describe the stream, then the OBU itself.
fn av1c(obu: &[u8]) -> Result<Vec<u8>, String> {
    let header = obu.first().copied().ok_or("empty AV1 sequence header")?;
    let mut start = 1 + usize::from(header & 4 != 0);
    if header & 2 != 0 {
        start += leb128(obu.get(start..).unwrap_or_default()).1;
    }
    let mut bits = Bits::new(obu.get(start..).ok_or("AV1 sequence header too short")?);
    let s = sequence_fields(&mut bits);
    let mut record = vec![
        0x81,
        (s.profile << 5) as u8 | s.level as u8,
        (s.tier << 7 | s.high_bitdepth << 6 | s.twelve_bit << 5 | s.mono << 4 | s.subsampling_x << 3 | s.subsampling_y << 2 | s.chroma_position) as u8,
        0,
    ];
    if s.profile > 2 || s.level > 31 {
        return Err("AV1 sequence header could not be read".into());
    }
    record.extend_from_slice(obu);
    Ok(record)
}

#[derive(Default)]
struct SequenceFields {
    profile: u32,
    level: u32,
    tier: u32,
    high_bitdepth: u32,
    twelve_bit: u32,
    mono: u32,
    subsampling_x: u32,
    subsampling_y: u32,
    chroma_position: u32,
}

// AV1 5.5.1 sequence_header_obu(), down to color_config(); operating point 0 is the one recorded.
fn sequence_fields(bits: &mut Bits) -> SequenceFields {
    let mut s = SequenceFields { profile: bits.bits(3), ..Default::default() };
    bits.skip(1);
    let reduced = bits.flag();
    if reduced {
        s.level = bits.bits(5);
    } else {
        let mut decoder_model = false;
        let mut delay_length = 0;
        if bits.flag() {
            bits.skip(64);
            if bits.flag() {
                // uvlc() reads like ue(v).
                bits.ue();
            }
            decoder_model = bits.flag();
            if decoder_model {
                delay_length = bits.bits(5) as usize + 1;
                bits.skip(32 + 5 + 5);
            }
        }
        let display_delay = bits.flag();
        let points = bits.bits(5) + 1;
        for point in 0..points {
            bits.skip(12);
            let level = bits.bits(5);
            let tier = if level > 7 { bits.bit() } else { 0 };
            if point == 0 {
                (s.level, s.tier) = (level, tier);
            }
            if decoder_model && bits.flag() {
                bits.skip(2 * delay_length + 1);
            }
            if display_delay && bits.flag() {
                bits.skip(4);
            }
        }
    }
    let width_bits = bits.bits(4) as usize + 1;
    let height_bits = bits.bits(4) as usize + 1;
    bits.skip(width_bits + height_bits);
    if !reduced && bits.flag() {
        bits.skip(4 + 3);
    }
    bits.skip(3);
    if !reduced {
        bits.skip(4);
        let order_hint = bits.flag();
        if order_hint {
            bits.skip(2);
        }
        let force_screen_content = if bits.flag() { 2 } else { bits.bit() };
        if force_screen_content > 0 && !bits.flag() {
            bits.skip(1);
        }
        if order_hint {
            bits.skip(3);
        }
    }
    bits.skip(3);
    s.high_bitdepth = bits.bit();
    if s.profile == 2 && s.high_bitdepth == 1 {
        s.twelve_bit = bits.bit();
    }
    s.mono = if s.profile == 1 { 0 } else { bits.bit() };
    let (mut primaries, mut transfer, mut matrix) = (2, 2, 2);
    if bits.flag() {
        (primaries, transfer, matrix) = (bits.bits(8), bits.bits(8), bits.bits(8));
    }
    if s.mono == 1 {
        (s.subsampling_x, s.subsampling_y) = (1, 1);
    } else if primaries == 1 && transfer == 13 && matrix == 0 {
        (s.subsampling_x, s.subsampling_y) = (0, 0);
    } else {
        bits.skip(1);
        (s.subsampling_x, s.subsampling_y) = match s.profile {
            0 => (1, 1),
            1 => (0, 0),
            _ if s.twelve_bit == 1 => {
                let x = bits.bit();
                (x, if x == 1 { bits.bit() } else { 0 })
            }
            _ => (1, 0),
        };
        if s.subsampling_x == 1 && s.subsampling_y == 1 {
            s.chroma_position = bits.bits(2);
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(text: &str) -> Vec<u8> {
        (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap()).collect()
    }

    // The sequence headers and record boxes below come from the NVIDIA encoders and from the MP4s
    // Windows' own writer made of their output.
    const H264_HEADER: &str = "000000016764002aac2b403c0113f2e02d4040405000003e80001d4c00f1c2aa0000000168ee3cb0";
    const HEVC_HEADER: &str = "0000000140010c01ffff21600000030090000003000003007bac090000000142010121600000030090000003000003007ba003c0801107cb96b4a421192e30142020202080000003008000001e04000000014401c0f7c0cc90";
    const AV1_HEADER: &str = "0a0f0000004eabbfc37e0010cc80808082";

    #[test]
    fn annex_b_splits_on_three_and_four_byte_start_codes() {
        let data = hex("00000001091000000167aa00000168bb00");
        let units: Vec<Vec<u8>> = nal_units(&data).into_iter().map(<[u8]>::to_vec).collect();
        assert_eq!(units, vec![hex("0910"), hex("67aa"), hex("68bb")]);
    }

    #[test]
    fn emulation_prevention_bytes_are_removed_before_reading() {
        assert_eq!(rbsp(&hex("0000030100000300")), hex("000001000000"));
    }

    #[test]
    fn the_h264_record_matches_windows_and_adds_the_high_profile_fields() {
        let config = Config::new(Codec::H264, &hex(H264_HEADER), &[]).unwrap();
        let windows = "0164002affe1001c6764002aac2b403c0113f2e02d4040405000003e80001d4c00f1c2aa01000468ee3cb0";
        assert_eq!(config.record[..windows.len() / 2], hex(windows)[..]);
        assert_eq!(config.record[windows.len() / 2..], [0xfd, 0xf8, 0xf8, 0], "4:2:0, 8-bit");
    }

    #[test]
    fn the_hevc_record_matches_windows_apart_from_the_frame_rate_hint() {
        let config = Config::new(Codec::Hevc, &hex(HEVC_HEADER), &[]).unwrap();
        let windows = hex(
            "0121600000009000000000007bf000fcfdf8f83c000b03a00001001740010c01ffff21600000030090000003000003007bac09a10001002f42010121600000030090000003000003007ba003c0801107cb96b4a421192e30142020202080000003008000001e04a2000100074401c0f7c0cc90",
        );
        assert_eq!(config.record[..19], windows[..19], "profile, tier, level, chroma, bit depths");
        assert_eq!(config.record[19..21], [0, 0], "no average frame rate is promised");
        assert_eq!(config.record[21], 0x0f, "one temporal layer, nested, four-byte lengths");
        assert_eq!(config.record[22..], windows[22..], "the three parameter set arrays");
    }

    #[test]
    fn the_av1_record_matches_windows() {
        let config = Config::new(Codec::Av1, &hex(AV1_HEADER), &[]).unwrap();
        assert_eq!(config.record, hex("81098c000a0f0000004eabbfc37e0010cc80808082"));
    }

    #[test]
    fn h264_samples_lose_the_delimiter_and_the_parameter_sets_and_get_lengths() {
        let config = Config::new(Codec::H264, &hex(H264_HEADER), &[]).unwrap();
        let mut sample = hex("0000000109100000000106050102");
        sample.extend(hex(H264_HEADER));
        sample.extend(hex("0000000165aabbcc"));
        let mut out = Vec::new();
        config.write_sample(&sample, true, &mut out).unwrap();
        assert_eq!(out, hex("00000004060501020000000465aabbcc"), "the SEI and the slice remain");
        assert_eq!(config.sample_size(&sample, true), out.len());
    }

    #[test]
    fn hevc_samples_keep_parameter_sets_that_differ_from_the_record() {
        let config = Config::new(Codec::Hevc, &hex(HEVC_HEADER), &[]).unwrap();
        let sample = hex("0000000146010000000142010999000000012601aa");
        let mut out = Vec::new();
        config.write_sample(&sample, true, &mut out).unwrap();
        assert_eq!(out, hex("0000000442010999000000032601aa"), "the delimiter goes, the changed SPS stays");
    }

    #[test]
    fn av1_samples_lose_the_temporal_delimiter() {
        let config = Config::new(Codec::Av1, &hex(AV1_HEADER), &[]).unwrap();
        let mut sample = hex("1200");
        sample.extend(hex(AV1_HEADER));
        sample.extend(hex("3203aabbcc"));
        let mut out = Vec::new();
        config.write_sample(&sample, true, &mut out).unwrap();
        let mut expected = hex(AV1_HEADER);
        expected.extend(hex("3203aabbcc"));
        assert_eq!(out, expected);
    }

    #[test]
    fn an_av1_keyframe_without_its_sequence_header_gets_one() {
        let config = Config::new(Codec::Av1, &hex(AV1_HEADER), &[]).unwrap();
        let sample = hex("12003203aabbcc");
        assert_eq!(config.sample_size(&sample, true), hex(AV1_HEADER).len() + 5);
        assert_eq!(config.sample_size(&sample, false), 5, "only sync samples need it");
    }

    #[test]
    fn a_missing_parameter_set_is_an_error_not_a_broken_file() {
        assert!(Config::new(Codec::H264, &hex("0000000168ee3cb0"), &[]).is_err());
        assert!(Config::new(Codec::Av1, &[], &hex("1200")).is_err());
    }
}
