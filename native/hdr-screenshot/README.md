# HDR screenshot helper

This short-lived Windows helper takes every achievement screenshot on Windows. It ships only as a
Windows executable, and Linux takes its screenshots another way (see
[docs/linux.md](../../docs/linux.md)). It captures the monitor showing the game with Windows Graphics
Capture and writes an ordinary PNG: tone-mapped to SDR sRGB from `R16G16B16A16_FLOAT` when HDR is
active, the plain `R8G8B8A8` frame otherwise. The monitor is chosen with `--pid <n>` (the game's
largest visible window), then the window in front, then the primary display. The helper replaced
`screenshot-desktop`, whose Windows path compiled a C# screen grabber with `csc.exe` into `%TEMP%` and
ran it, which antivirus behaviour engines report as a screen-capture tool.

Windows 10 cannot turn off the yellow border Windows Graphics Capture draws around a captured screen.
Where Windows has no switch for it, the helper uses DXGI Desktop Duplication, which draws nothing, and
skips frames that only moved the pointer, since their texture is still black. Both paths feed the same
tone mapping.

HDR is read from the display path of the captured monitor with
`DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2`, not from DXGI: `IDXGIOutput6::GetDesc1` keeps reporting the
SDR color space while the desktop composes in HDR, and the older `..._ADVANCED_COLOR_INFO` query cannot
tell HDR from Windows 11 automatic colour management. The capture is divided by the SDR white level of
that same path, so the desktop is not crushed when the "SDR content brightness" slider is above its
minimum.

The helper runs only for an achievement screenshot: with the output path alone when the HDR preference
is `Automatic`, with `--sdr` when it is off. It does not run in the background and does not change
Electron's renderer color mode.

## Tone mapping

The goal is a screenshot that looks like an SDR capture of the same scene, with the highlights an SDR
capture would have thrown away still present. Everything is anchored on diffuse white, not on the
display peak as broadcast mapping does. BT.2390's EETF, libplacebo's spline and BT.2446 method A all
darken diffuse white by design, because they assume a viewer whose eye adapts to the whole picture. A
screenshot is viewed next to ordinary SDR content and cannot afford that.

- **Scene peak.** A histogram indexed by the f16 bit pattern, taken over the *second* brightest pixel
  of every 2x2 block and read at the 99.99th percentile. The rank filter separates a hundred isolated
  specular samples from a real bright window, and the bit-pattern histogram makes the percentile exact
  without decoding.
- **Curve.** Identity up to a knee a fixed perceptual distance (`SHOULDER`, in normalised PQ) below
  diffuse white, then an extended Reinhard shoulder that lands exactly on the scene peak with a small
  non-zero slope. PQ rather than linear light lets the few remaining output codes cover several stops of
  highlight, and the non-zero end slope stops the brightest highlights collapsing into one flat white.
  A fixed shoulder width makes the result insensitive to over-estimating the peak: a scene read as 49x
  diffuse white instead of 8x moves the picture by about a tenth of one output code.
- **Application.** The curve drives the brightest channel and the other two follow by the same factor,
  so hue and saturation survive. A highlight is then blended towards its own brightest channel with
  rising intensity, because scaling cannot brighten a channel already at maximum, and a coloured light
  would otherwise render as one flat patch at every intensity.
- **No local contrast pass.** A tile-based base/detail split added the full detail term back after
  compressing the base, which undid the roll-off for every pixel brighter than its neighbourhood and
  clipped nearly everything above white. Restricting the term to a high-frequency residual fixes the
  clipping but rings around bright edges and gains little. The curve alone measured better and is
  cheaper.

Compression and highlight blend depend only on the brightest channel, which is one of the 31744 finite
non-negative f16 patterns. Both are resolved once into a lookup table and cost one lookup per pixel,
holding exactly what the curve returns, with no interpolation.

## Encoding

The PNG is written as RGB, not RGBA: a screenshot is opaque, so the alpha channel only held 255 and
cost a quarter of the file. DEFLATE runs at level 3 rather than the crate default of 6, which measured
about a fifth of the time for a file a few percent *smaller* than the RGBA one it replaces. Level 1 and
`FdeflateUltraFast` are faster but give up 10 to 20 percent of the size, and level 6 costs four times
level 3 for another 4 percent, so the curve is flat past 3. Encoding is still the largest single cost
of a capture.

Build and copy the x64 release binaries from the repository root:

```powershell
$env:RUSTFLAGS = "--remap-path-prefix=$env:USERPROFILE\.cargo=.cargo --remap-path-prefix=$PWD=."
cargo build --release --locked --manifest-path native/hdr-screenshot/Cargo.toml
Copy-Item native/hdr-screenshot/target/release/aw-next-hdr-screenshot.exe `
  watchdog/native/aw-next-hdr-screenshot.exe -Force
Copy-Item native/hdr-screenshot/target/release/aw-next-clip.exe `
  watchdog/native/aw-next-clip.exe -Force
```

The `RUSTFLAGS` line is required. `strip = "symbols"` drops the symbol table but not the panic
locations, so without it the committed executable carries the absolute source path of every dependency
and publishes the account name of whoever built it. Cargo's `trim-paths` profile setting would replace
it, but it is still unstable as of Cargo 1.97. Check a rebuilt binary with
`Select-String -Path watchdog/native/aw-next-hdr-screenshot.exe -Pattern 'C:\\Users' -Encoding ascii`,
which must find nothing.

`--status` prints `hdr-active` or `sdr`. `--force <output.png>` captures on an SDR desktop for
development, `--sdr <output.png>` takes the plain 8-bit capture even on an HDR desktop, and
`--duplication <output.png>` takes the Windows 10 path on any Windows. End users need neither Rust nor
the Windows SDK.

The helper depends on the MIT-licensed `windows-capture` crate. Its license ships beside the
executable, together with the license for the HDR capture implementation.

# Video clip recorder

`aw-next-clip.exe`, the second binary of this crate, records the video clips. The Watchdog starts it
when a tracked game starts with clips enabled and stops it when the game exits. It shares the
DisplayConfig queries (`src/display.rs`) and the tone curve (`src/tone.rs`) with the screenshot helper,
so an HDR clip looks like an HDR screenshot of the same scene.

Everything runs on parts of Windows, with no third-party media library:

- **Capture**: DXGI Desktop Duplication of the monitor showing the game's largest window. It draws no
  capture border on Windows 10 and injects nothing into the game. The display is asked for FP16 only
  when DisplayConfig reports HDR. Automatic colour management composes even SDR desktops in FP16, and
  the mode description can say FP16 while the frames are 8-bit, so each frame's own format decides
  whether it goes through the tone-mapping pixel shader.
- **Conversion**: the D3D11 video processor scales to the chosen height and converts to NV12 (BT.709,
  limited range). The screen is read once per output frame, and an unchanged desktop is not converted
  again.
- **Encoding**: the GPU's own Media Foundation encoder (H.264, HEVC or AV1, picked with `MFTEnum2` on
  the capturing adapter), fed with GPU textures. Constant bitrate, one keyframe a second, no B-frames.
  The bitrate comes from the quality level and the real output size (`bitrate()` in `video.rs`;
  `app/util/clipProfile.js` uses the same numbers for the size estimate). An encoder that refuses the
  rate is retried at 120, 60 and 30 FPS (`fallback fps` line). With no hardware H.264 encoder, or when
  every hardware attempt failed for a reason other than a lost device, Windows' software H.264 encoder
  takes over (`fallback encoder` line). Pictures are then read back from the GPU as NV12 bytes, the rate
  is capped at 30 FPS and the picture at 1080p, late ticks are skipped, and B-frames are off because the
  ring and the muxer sort by time only.
- **Frame rate**: `--fps <n>` (1 to 480) or `--fps unlocked`, which reads the refresh rate of the
  monitor showing the game (`EnumDisplaySettingsW`) and rebuilds the capture within three seconds of a
  change. The `ready` line reports the rate the encoder really runs at, which sets the last frame's
  length in the MP4.
- **Sound**: WASAPI process loopback on the game's process tree, or the default output device, at
  48 kHz, encoded by Windows' AAC encoder and timed on the same performance counter as the video.
- **Saving**: packets live in a ring in memory (`ring.rs`). A clip is cut from the keyframe before its
  start, its times rebased to zero, and written to MP4 by the recorder itself (`mp4.rs`, `codec.rs`),
  so nothing is encoded twice. Unlocks that land before a clip has ended extend it, up to 60 seconds.

## MP4 writing

Windows' own MP4 writer (the sink writer over `mfmp4srcsnk.dll`) is not used. It has no `av01` sample
entry on Windows 10 or on Windows 11 before the 22H2 update of August 2023 (22621.2215, checked in
every x64 build listed by Winbindex), so AV1 clips failed there with `MF_E_SINK_HEADERS_NOT_FOUND`
(issue #151). The recorder's own writer works the same everywhere and takes 2 to 6 ms for a 10-second
1080p60 clip, where the sink writer took 55 to 110 ms.

- **Layout**: `ftyp`, then `moov`, then one `mdat` with video and audio in half-second chunks, so a
  clip starts playing before it is read to the end. 64-bit offsets only past 4 GB.
- **Video**: H.264 and HEVC samples arrive as Annex B. They are rewritten with four-byte lengths, and
  the access unit delimiters and the parameter sets that the `avcC` or `hvcC` record already holds are
  left out (`avc1` and `hvc1` keep them in the record). The record is built from the first keyframe's
  own parameter sets. AV1 samples lose their temporal delimiters, and a keyframe without a sequence
  header gets one, as AV1-ISOBMFF requires. `av1C` is read from the sequence header OBU. A `colr` box
  states BT.709 limited range.
- **Timing**: video at 90 kHz from the recorded times, so a variable frame rate stays exact. Sound
  that starts a few milliseconds after the first frame is shifted with a `ctts` offset, as the sink
  writer did: Windows' player ignores an empty edit list.

`cargo test` in this crate checks the records against the ones Windows wrote for the same encoder
output, reads every sample back through the tables, and has Media Foundation open an AV1 clip.

The Watchdog talks to it over stdin and stdout, one line per message:

| Direction | Line |
|---|---|
| in | `clip <age-ms> <path>`: an unlock shown `<age-ms>` ago, its clip to be written to `<path>` |
| in | `quit`, or stdin closing: finish the pending clips, then exit |
| out | `ready ...`, `writing <path>`, `saved <path>`, `saved-partial <frames>/<total> <path>`, `merged <path>`, `fallback fps ...`, `fallback encoder ...`, `error <code> <detail>`, `log <text>`, `stats ...` |

`stats` doubles as the heartbeat. It prints every five seconds while the capture loop turns and not at
all when it hangs, which is what the Watchdog waits for (15 s, 30 s for the first one) before killing
and restarting the recorder. Exit codes 2 (bad arguments), 3 (no Media Foundation) and 4 (no encoder at
all, after `error no-encoder`) are not restarted.

A clip is written under `<path>.part` and renamed. If writing fails midway (a full disk), the file is
written again as the longest clip that fits in the bytes the failed write managed, and kept under the
final name with a `saved-partial` line when it holds at least a second of video. Otherwise it is
deleted. A finished file that cannot be renamed stays as `<path>.part`, since it is the only copy.

`writing <path>` comes before each write, which ends with `saved`, `saved-partial` or
`error write-failed`. In between, the Watchdog does not kill the recorder, neither when it goes silent
nor when it takes longer than 30 s to quit, unless the write has lasted a minute. A recorder that dies
anyway leaves a `.part` that `watchdog/notification/clipPart.js` settles: renamed when its `moov` box
is complete (only the rename failed), deleted otherwise (the index is written last, and no player opens
a file without it). Each new recorder also settles the `.part` files older than two minutes in the clip
folder, left by a PC that went down mid-write.

`--selftest <out.mp4> [seconds]` records the desktop for that long and writes it, without the
Watchdog. `--hdr force` runs the tone-mapping pass even on an SDR desktop. `--encoder software` skips
the GPU encoders, to try the software one on a machine that has a GPU.

NVIDIA's H.264 encoder still runs a work item after it has been shut down, and releasing it at once
crashed in that callback about once in thirty runs. A retired encoder is therefore kept for a few
seconds before release, and at exit the process leaves the last one to Media Foundation's own shutdown.
