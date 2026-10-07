pub mod display;
pub mod tone;

pub type AnyError = Box<dyn std::error::Error + Send + Sync>;
