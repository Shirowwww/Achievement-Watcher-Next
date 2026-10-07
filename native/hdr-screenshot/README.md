# HDR screenshot helper

This transient Windows helper takes every achievement screenshot. It captures the primary display
with Windows Graphics Capture and writes an ordinary PNG: in `R16G16B16A16_FLOAT`, tone-mapped to
SDR sRGB, when HDR is active, and as the plain `R8G8B8A8` frame otherwise. It replaced
`screenshot-desktop`, whose Windows path compiled a C# screen grabber with `csc.exe` into `%TEMP%`
and ran it, which antivirus behaviour engines report as a screen-capture tool.

Whether HDR is on is read from the display path of the primary monitor with
`DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2`, not from DXGI: `IDXGIOutput6::GetDesc1` keeps reporting
the SDR color space while the desktop composes in HDR, and the older `..._ADVANCED_COLOR_INFO`
query cannot tell HDR apart from Windows 11 automatic colour management. The capture is divided by
the SDR white level of that same path, so the desktop is not crushed when the "SDR content
brightness" slider sits above its minimum.

It is started only for an achievement screenshot: with the output path alone when the HDR preference
is `Automatic`, with `--sdr` when it is off. It does not run in the background and does not change
Electron's renderer color mode.

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

Build and copy the x64 release binaries from the repository root:

```powershell
$env:RUSTFLAGS = "--remap-path-prefix=$env:USERPROFILE\.cargo=.cargo --remap-path-prefix=$PWD=."
cargo build --release --locked --manifest-path native/hdr-screenshot/Cargo.toml
Copy-Item native/hdr-screenshot/target/release/aw-next-hdr-screenshot.exe `
  watchdog/native/aw-next-hdr-screenshot.exe -Force
Copy-Item native/hdr-screenshot/target/release/aw-next-clip.exe `
  watchdog/native/aw-next-clip.exe -Force
```

The `RUSTFLAGS` line is not optional. `strip = "symbols"` drops the symbol table but not the
panic locations, so without it the committed executable carries the absolute source path of every
dependency and publishes the account name of whoever built it. Cargo's own `trim-paths` profile
setting would replace it, but it is still unstable as of Cargo 1.97. Check a rebuilt binary with
`Select-String -Path watchdog/native/aw-next-hdr-screenshot.exe -Pattern 'C:\\Users' -Encoding ascii`,
which must find nothing.

`--status` prints `hdr-active` or `sdr`. `--force <output.png>` is available for development-time
capture testing on an SDR desktop, and `--sdr <output.png>` takes the plain 8-bit capture even on
an HDR desktop. End users do not need Rust or the Windows SDK.

The helper depends on the MIT-licensed `windows-capture` crate. Its license is shipped beside the
executable, together with the license for the HDR capture implementation.

# Video clip recorder

`aw-next-clip.exe`, the second binary of this crate, records the video souvenirs. The Watchdog
starts it when a tracked game starts with clips enabled and stops it when the game exits. It shares
the DisplayConfig queries (`src/display.rs`) and the tone curve (`src/tone.rs`) with the screenshot
helper, so an HDR clip looks like an HDR screenshot of the same scene.

Everything runs on parts of Windows, with no third-party media library:

- **Capture**: DXGI Desktop Duplication of the monitor showing the game's largest window. It draws
  no capture border on Windows 10 and injects nothing into the game. The display is asked for FP16
  only when DisplayConfig reports it in HDR; automatic colour management composes even SDR desktops
  in FP16, and the mode description can say FP16 while the frames are 8-bit, so each frame's own
  format decides whether it goes through the tone-mapping pixel shader.
- **Conversion**: the D3D11 video processor scales to the chosen height and converts to NV12
  (BT.709, limited range). The screen is read once per output frame, and an unchanged desktop is
  not converted again.
- **Encoding**: the GPU's own Media Foundation encoder (H.264, HEVC or AV1, picked with `MFTEnum2`
  on the capturing adapter), fed with GPU textures. Constant bitrate, one keyframe a second, no
  B-frames. The bitrate comes from the quality level and the real output size (`bitrate()` in
  `video.rs`; `app/util/clipProfile.js` uses the same numbers for the size estimate).
- **Sound**: WASAPI process loopback on the game's process tree, or the default output device, at
  48 kHz, encoded by Windows' AAC encoder and timed on the same performance counter as the video.
- **Saving**: packets live in a ring in memory (`ring.rs`). A clip is cut from the keyframe before
  its start, its times rebased to zero, and written by the sink writer with the encoders' own output
  types as input types, so nothing is encoded twice. Unlocks that land before a clip has ended
  extend it, up to 60 seconds.

The Watchdog talks to it over stdin and stdout, one line per message:

| Direction | Line |
|---|---|
| in | `clip <age-ms> <path>`: an unlock shown `<age-ms>` ago, its clip to be written to `<path>` |
| in | `quit`, or stdin closing: finish the pending clips, then exit |
| out | `ready ...`, `saved <path>`, `merged <path>`, `error <code> <detail>`, `log <text>`, `stats ...` |

`--selftest <out.mp4> [seconds]` records the desktop for that long and writes it, without the
Watchdog. `--hdr force` runs the tone-mapping pass even on an SDR desktop.

NVIDIA's H.264 encoder still runs a work item after it has been shut down, and releasing it straight
away crashed in that callback about once in thirty runs. A retired encoder is therefore kept for a
few seconds before release, and at exit the process leaves the last one to Media Foundation's own
shutdown.
