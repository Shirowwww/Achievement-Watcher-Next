//! The app's typefaces, loaded from memory into a private DirectWrite collection. Nothing is
//! installed on the machine. A Windows build too old for in-memory fonts (before 10 1703) falls back
//! to Segoe UI, which every supported Windows has.

use windows::Win32::Graphics::DirectWrite::{
    DWRITE_FACTORY_TYPE_ISOLATED, DWriteCreateFactory, IDWriteFactory, IDWriteFactory5, IDWriteFontCollection,
};
use windows::core::{Interface, Result};

const EMBEDDED: [&[u8]; 4] = [
    include_bytes!("../assets/fonts/OpenSans-Regular.ttf"),
    include_bytes!("../assets/fonts/OpenSans-Bold.ttf"),
    include_bytes!("../assets/fonts/Raleway-Bold.ttf"),
    include_bytes!("../assets/fonts/FontAwesome-Solid.ttf"),
];

pub struct Fonts {
    pub factory: IDWriteFactory,
    pub collection: Option<IDWriteFontCollection>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Family {
    Text,
    Display,
    Icons,
}

impl Family {
    pub fn name(self, embedded: bool) -> &'static str {
        match (self, embedded) {
            (Family::Text, true) => "Open Sans",
            (Family::Display, true) => "Raleway",
            (Family::Icons, _) => "Font Awesome 5 Free",
            (_, false) => "Segoe UI",
        }
    }
}

pub fn load() -> Result<Fonts> {
    let factory5: Result<IDWriteFactory5> = unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_ISOLATED) };
    match factory5 {
        Ok(factory5) => {
            let collection = embedded_collection(&factory5).ok();
            Ok(Fonts { factory: factory5.cast()?, collection })
        }
        Err(_) => {
            let factory: IDWriteFactory = unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_ISOLATED)? };
            Ok(Fonts { factory, collection: None })
        }
    }
}

fn embedded_collection(factory: &IDWriteFactory5) -> Result<IDWriteFontCollection> {
    unsafe {
        let loader = factory.CreateInMemoryFontFileLoader()?;
        factory.RegisterFontFileLoader(&loader)?;
        let builder = factory.CreateFontSetBuilder()?;
        for data in EMBEDDED {
            let file = loader.CreateInMemoryFontFileReference(factory, data.as_ptr().cast(), data.len() as u32, None)?;
            builder.AddFontFile(&file)?;
        }
        let set = builder.CreateFontSet()?;
        factory.CreateFontCollectionFromFontSet(&set)?.cast()
    }
}
