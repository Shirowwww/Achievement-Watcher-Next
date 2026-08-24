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

## Tone mapping

The goal is a screenshot that looks like the SDR capture of the same scene, with the highlights an
SDR capture would have thrown away still present. Everything is therefore anchored on diffuse
white rather than on the display peak the way broadcast display mapping is: BT.2390's EETF,
libplacebo's spline and BT.2446 method A all darken diffuse white by design, because they assume a
viewer whose eye adapts to the whole picture. A screenshot is looked at next to ordinary SDR
content, so it cannot spend that.

- **Scene peak.** A histogram indexed by the f16 bit pattern itself, taken over the *second*
  brightest pixel of every 2x2 block, read at the 99.99th percentile. The rank filter is what
  separates a hundred isolated specular samples from a real bright window; the bit-pattern
  histogram makes the percentile exact and keeps the scan free of decoding.
- **Curve.** Identity up to a knee placed a fixed perceptual distance (`SHOULDER`, in normalised
  PQ) below diffuse white, then an extended Reinhard shoulder that lands exactly on the scene peak
  with a small but non-zero slope. Working in PQ rather than in linear light is what lets a handful
  of remaining output codes cover several stops of highlight; the non-zero end slope is what stops
  the brightest highlights collapsing into one flat white. A fixed shoulder width also makes the
  result insensitive to over-estimating the peak - a scene read as 49x diffuse white instead of 8x
  moves the whole picture by about a tenth of one output code.
- **Application.** The curve drives the brightest channel and the other two follow by the same
  factor, so hue and saturation survive untouched; a highlight is then blended towards its own
  brightest channel with rising intensity, because scaling alone cannot brighten a channel that is
  already at maximum and a coloured light would otherwise render as one flat patch at every
  intensity.
- **No local contrast pass.** An earlier tile-based base/detail split re-added the full detail term
  after compressing the base, which undid the roll-off for every pixel brighter than its
  neighbourhood: it clipped essentially all above-white content. Restricting the term to a genuine
  high-frequency residual fixes the clipping but rings around bright edges, and buys little; the
  curve alone measured better and is cheaper.

Both the compression and the highlight blend depend only on the brightest channel, which is one of
the 31744 finite non-negative f16 patterns, so both are resolved once into a lookup table and cost
a single lookup per pixel. The tables hold exactly what the curve would return - no interpolation.

## Encoding

The PNG is written as RGB, not RGBA: a screenshot is opaque, so the alpha channel only ever held
255 and cost a quarter of the file. DEFLATE runs at level 3 rather than the crate default of 6,
which was measured at about a fifth of the time for a file a few percent *smaller* than the RGBA
one it replaces. Level 1 and `FdeflateUltraFast` are faster still but give up 10 to 20 percent of
the size, and level 6 costs four times level 3 for another 4 percent - the curve is flat past 3.
Encoding is nonetheless still the largest single cost of a capture.

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
