//! Translated text. The table is generated from strings.json by build.rs.

use std::sync::atomic::{AtomicUsize, Ordering};

include!(concat!(env!("OUT_DIR"), "/strings_table.rs"));

static LANGUAGE: AtomicUsize = AtomicUsize::new(0);

/// Picks the language from a Windows LANGID, the same way build/installer.nsh picks the NSIS one:
/// by primary language, so regional variants (fr-CA, de-CH, es-MX...) get their language. Only
/// Portuguese and Chinese need the sublanguage, since each has two translations.
pub fn select(langid: u16) {
    let code = match (langid & 0x3FF, langid) {
        (0x16, 0x0416) => "pt-BR",
        (0x16, _) => "pt",
        (0x04, 0x0404 | 0x0C04 | 0x1404) => "zh-TW",
        (0x04, _) => "zh-CN",
        (primary, _) => primary_code(primary),
    };
    let index = LANGUAGES.iter().position(|candidate| *candidate == code).unwrap_or(0);
    LANGUAGE.store(index, Ordering::Relaxed);
}

fn primary_code(primary: u16) -> &'static str {
    match primary {
        0x0C => "fr",
        0x07 => "de",
        0x0A => "es",
        0x10 => "it",
        0x05 => "cs",
        0x1B => "sk",
        0x0E => "hu",
        0x15 => "pl",
        0x19 => "ru",
        0x22 => "uk",
        0x1F => "tr",
        0x1E => "th",
        0x11 => "ja",
        0x06 => "da",
        0x13 => "nl",
        0x0B => "fi",
        0x08 => "el",
        0x21 => "id",
        0x12 => "ko",
        0x14 => "nb",
        0x1D => "sv",
        0x2A => "vi",
        _ => "en",
    }
}

/// The BCP 47 tag DirectWrite needs to pick the right fallback glyphs (Japanese and Chinese share
/// code points but not shapes).
pub fn locale() -> &'static str {
    match LANGUAGES[LANGUAGE.load(Ordering::Relaxed)] {
        "en" => "en-US",
        "pt" => "pt-PT",
        "nb" => "nb-NO",
        other => other,
    }
}

pub fn tr(text: Text) -> &'static str {
    TABLE[text as usize][LANGUAGE.load(Ordering::Relaxed)]
}

/// `tr` with `{name}` placeholders replaced.
pub fn fill(text: Text, values: &[(&str, &str)]) -> String {
    values.iter().fold(tr(text).to_owned(), |acc, (name, value)| acc.replace(&format!("{{{name}}}"), value))
}

pub fn percent(value: f32) -> String {
    fill(Text::Percent, &[("n", &format!("{}", value.clamp(0.0, 100.0).floor() as u32))])
}

/// A byte count as whole megabytes, or gigabytes with one decimal past 1 GB.
pub fn size(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    let megabytes = bytes as f64 / MB;
    if megabytes >= 1024.0 {
        let gigabytes = megabytes / 1024.0;
        let shown = if gigabytes >= 100.0 { format!("{gigabytes:.0}") } else { format!("{gigabytes:.1}") };
        return fill(Text::UnitGb, &[("n", &localize_decimal(&shown))]);
    }
    fill(Text::UnitMb, &[("n", &format!("{}", megabytes.round().max(1.0) as u64))])
}

/// Languages that write a decimal comma.
fn localize_decimal(number: &str) -> String {
    let comma = !matches!(LANGUAGES[LANGUAGE.load(Ordering::Relaxed)], "en" | "th" | "ja" | "zh-CN" | "zh-TW" | "ko");
    if comma { number.replace('.', ",") } else { number.to_owned() }
}
