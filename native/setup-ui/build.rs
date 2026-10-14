//! Turns strings.json into a static table and a `Text` enum, so a missing key is a compile error and
//! nothing parses JSON at run time. A language without a translation for a key falls back to
//! English here; test/updates-security/setupUiStrings.test.js is what rejects that in the app suite.

use std::fmt::Write as _;
use std::{env, fs, path::PathBuf};

fn variant_name(key: &str) -> String {
    key.split('_')
        .map(|part| {
            let mut chars = part.chars();
            chars.next().map(|first| first.to_ascii_uppercase().to_string() + chars.as_str()).unwrap_or_default()
        })
        .collect()
}

fn main() {
    println!("cargo::rerun-if-changed=strings.json");
    println!("cargo::rerun-if-changed=assets");
    let source = fs::read_to_string("strings.json").expect("strings.json");
    let table: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&source).expect("valid strings.json");
    let languages: Vec<String> = table["_languages"]
        .as_array()
        .expect("_languages")
        .iter()
        .map(|value| value.as_str().expect("language code").to_owned())
        .collect();
    let keys: Vec<&String> = table.keys().filter(|key| !key.starts_with('_')).collect();

    let mut out = String::new();
    writeln!(out, "pub const LANGUAGES: [&str; {}] = {:?};", languages.len(), languages).unwrap();
    writeln!(out, "#[derive(Clone, Copy, Debug, PartialEq, Eq)]\npub enum Text {{").unwrap();
    for key in &keys {
        writeln!(out, "    {},", variant_name(key)).unwrap();
    }
    writeln!(out, "}}").unwrap();
    writeln!(out, "pub static TABLE: [[&str; {}]; {}] = [", languages.len(), keys.len()).unwrap();
    for key in &keys {
        let entry = table[key.as_str()].as_object().expect("key object");
        let english = entry.get("en").and_then(|value| value.as_str()).expect("every key has English");
        let row: Vec<&str> = languages
            .iter()
            .map(|language| entry.get(language).and_then(|value| value.as_str()).filter(|text| !text.is_empty()).unwrap_or(english))
            .collect();
        writeln!(out, "    {:?},", row).unwrap();
    }
    writeln!(out, "];").unwrap();

    let path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("strings_table.rs");
    fs::write(path, out).expect("write strings table");
}
