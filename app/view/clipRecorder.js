'use strict';

// Records the desktop for the software clip recorder; the main process keeps and cuts the stream.
// The same stream gives souvenir screenshots, so a Wayland desktop asks to share the screen once.
const CHUNK_MS = 500;

async function framePng(track) {
  const bitmap = await new ImageCapture(track).grabFrame();
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

window.clipRecorder.onStart(async (plan) => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: plan.video, audio: true });
    const [track] = stream.getVideoTracks();
    window.clipRecorder.onFrameRequest(async (id) => {
      try {
        window.clipRecorder.frame(id, await framePng(track));
      } catch (err) {
        window.clipRecorder.error(`screenshot: ${err && err.message ? err.message : err}`);
        window.clipRecorder.frame(id, null);
      }
    });
    const recorder = new MediaRecorder(stream, {
      mimeType: plan.mimeType,
      videoBitsPerSecond: plan.videoBitsPerSecond,
      videoKeyFrameIntervalDuration: plan.keyframeMs,
    });
    recorder.ondataavailable = async (event) => {
      if (event.data.size) window.clipRecorder.chunk(new Uint8Array(await event.data.arrayBuffer()));
    };
    recorder.onerror = (event) => window.clipRecorder.error(event.error ? event.error.message : 'recorder error');
    recorder.onstart = () => {
      const { width, height, frameRate } = track.getSettings();
      window.clipRecorder.started(`${width}x${height} ${frameRate} fps, ${stream.getAudioTracks().length} audio track(s)`);
    };
    recorder.start(CHUNK_MS);
  } catch (err) {
    window.clipRecorder.error(err && err.message ? err.message : String(err));
  }
});
