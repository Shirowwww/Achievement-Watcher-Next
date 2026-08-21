# HDR screenshot helper

This transient Windows helper captures the primary display with Windows Graphics Capture in
`R16G16B16A16_FLOAT`, tone-maps HDR highlights to SDR sRGB, and writes an ordinary PNG. It exits
without capturing when HDR is not active, allowing the Watchdog to keep its existing SDR path.

Whether HDR is on is read from the display path of the primary monitor with
`DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2`, not from DXGI: `IDXGIOutput6::GetDesc1` keeps reporting
the SDR color space while the desktop composes in HDR, and the older `..._ADVANCED_COLOR_INFO`
query cannot tell HDR apart from Windows 11 automatic colour management. The capture is divided by
the SDR white level of that same path, so the desktop is not crushed when the "SDR content
brightness" slider sits above its minimum.

It is started only for an achievement screenshot when the HDR preference is `Automatic`. It does
not run in the background and does not change Electron's renderer color mode.

Build and copy the x64 release binary from the repository root:

```powershell
cargo build --release --locked --manifest-path native/hdr-screenshot/Cargo.toml
Copy-Item native/hdr-screenshot/target/release/aw-next-hdr-screenshot.exe `
  watchdog/native/aw-next-hdr-screenshot.exe -Force
```

`--status` prints `hdr-active` or `sdr`. `--force <output.png>` is available for development-time
capture testing on an SDR desktop. End users do not need Rust or the Windows SDK.

The helper depends on the MIT-licensed `windows-capture` crate. Its license is shipped beside the
executable, together with the license for the HDR capture implementation.
