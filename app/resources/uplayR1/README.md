# Uplay R1 loaders

The four x86/x64 Uplay and UPC R1 loader aliases are stored here as plain DLLs so the integrated
repair does not need to unpack them during normal use. `UplayR1-08-19-2026.7z` is the recovery copy
used when a loose resource has been removed, for example by antivirus software.

- Recovery archive SHA-256: `f48c6e18c55939b697f7a4fb4e73c6d7aeca240cf97db9f5f6533622deb9b335`
- x86 DLL SHA-256: `912ceb30ccb667f8fab8f5131db95b012010f0e35a035137f97440721d9a4743`
- x64 DLL SHA-256: `2baa49dcc090276aafb84847844f502978bfc043a0a02ed453226f12a9d30d15`

The aliases are byte-identical within each architecture, exactly like the R2 package. This build
keeps its achievement settings under `[Uplay]` rather than `[Settings]` and writes its saves under
`%APPDATA%\R1 UplayEmu Saves`; everything else about the achievement path matches R2, including the
`AchKeyPrefix` + objective-id key rule.

Confirm redistribution terms before publishing an installer.
