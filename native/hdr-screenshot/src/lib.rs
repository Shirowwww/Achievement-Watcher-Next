pub mod display;
pub mod gpu;
pub mod tone;
pub mod window;

pub type AnyError = Box<dyn std::error::Error + Send + Sync>;
