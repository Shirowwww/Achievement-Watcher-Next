'use strict';

const fs = require('fs');
const path = require('path');
const { createWebmRing } = require('../util/webmRing.js');

/*
  The software clip recorder for Linux, chosen in Settings when gpu-screen-recorder is not wanted or
  not installed. A hidden window records the desktop (and what plays on the speakers) with
  MediaRecorder; its WebM stream is kept here in a rolling buffer, and each unlock is cut out of it
  with the unlock in the middle. Encoding is done on the CPU, which is why it is opt-in.
*/

// MediaRecorder is asked for a keyframe this often; a clip can only start on one.
const KEYFRAME_MS = 1000;
// How long to wait past the end of a clip for the recorder to deliver it.
const DELIVERY_SLACK_MS = 3000;
const CPU_SAMPLE_MS = 5000;
const FRAME_TIMEOUT_MS = 3000;
const BITS_PER_PIXEL = { low: 0.08, medium: 0.13, high: 0.22 };

function videoBitrate(clip, height) {
  const width = (height * 16) / 9;
  const bits = width * height * clip.clipFps * BITS_PER_PIXEL[clip.clipQuality];
  return Math.round(Math.min(40e6, Math.max(1e6, bits)));
}

// What the hidden window records with: the constraints and MediaRecorder options.
function recordingPlan(clip, screenHeight) {
  const height = clip.clipResolution === 'native' ? screenHeight : Math.min(Number(clip.clipResolution), screenHeight);
  return {
    video: { frameRate: clip.clipFps, height },
    mimeType: 'video/webm;codecs=vp8,opus',
    videoBitsPerSecond: videoBitrate(clip, height),
    keyframeMs: KEYFRAME_MS,
  };
}

function createClipRecorder({ BrowserWindow, session, desktopCapturer, screen, preload, page, log, onCost = () => {} }) {
  let window = null;
  let ring = null;
  let clip = null;
  let startedAt = 0;
  let pending = null;
  let cpu = { total: 0, samples: 0, timer: null };

  function streamNow() {
    return Date.now() - startedAt;
  }

  function sampleCpu(app) {
    if (!window || window.isDestroyed()) return;
    const pid = window.webContents.getOSProcessId();
    const metric = app.getAppMetrics().find((m) => m.pid === pid);
    if (!metric) return;
    cpu.total += metric.cpu.percentCPUUsage;
    cpu.samples += 1;
  }

  function reportCost() {
    clearInterval(cpu.timer);
    if (cpu.samples) {
      const average = cpu.total / cpu.samples;
      log(`[clip] software recorder used ${average.toFixed(1)}% of one CPU on average`);
      onCost({ cpuPercent: Math.round(average * 10) / 10, at: Date.now() });
    }
    cpu = { total: 0, samples: 0, timer: null };
  }

  function writeClip(target, fromMs, toMs) {
    const data = ring && ring.cut(fromMs, toMs);
    if (!data) {
      log(`[clip] nothing recorded for ${target}`);
      return;
    }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target + '.tmp', data);
      fs.renameSync(target + '.tmp', target);
      log(`[clip] saved ${target}`);
    } catch (err) {
      log(`[clip] could not write ${target}: ${err.message || err}`);
    }
  }

  // Waits until the recorder has delivered the seconds after the unlock, then writes the clip.
  function finishPending() {
    const job = pending;
    if (!job) return;
    if (ring && ring.newest() < job.toMs && Date.now() < job.deadline) {
      job.timer = setTimeout(finishPending, 250);
      return;
    }
    pending = null;
    writeClip(job.target, job.fromMs, job.toMs);
  }

  const frames = new Map();
  let frameId = 0;

  function settleFrame(id, png) {
    const waiting = frames.get(id);
    if (!waiting) return;
    frames.delete(id);
    clearTimeout(waiting.timer);
    waiting.resolve(png);
  }

  // A PNG of what is being recorded right now, or null: screenshots reuse the recording's stream
  // instead of asking the desktop again.
  function grabFrame() {
    if (!window || window.isDestroyed() || !startedAt) return Promise.resolve(null);
    frameId += 1;
    const id = frameId;
    return new Promise((resolve) => {
      frames.set(id, { resolve, timer: setTimeout(() => settleFrame(id, null), FRAME_TIMEOUT_MS) });
      window.webContents.send('clip-recorder:frame', id);
    });
  }

  function trigger(target) {
    if (!ring || !clip) return null;
    if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.webm') {
      log(`[clip] refused clip path ${JSON.stringify(target)}`);
      return null;
    }
    if (pending) {
      log(`[clip] unlock joined the clip ${pending.target}`);
      return pending.target;
    }
    const half = Math.round((clip.clipSeconds * 1000) / 2);
    const at = streamNow();
    pending = { target, fromMs: at - half, toMs: at + half, deadline: Date.now() + half + DELIVERY_SLACK_MS, timer: null };
    pending.timer = setTimeout(finishPending, half);
    return target;
  }

  function start(settings, app) {
    stop();
    clip = settings;
    const half = Math.round((clip.clipSeconds * 1000) / 2);
    ring = createWebmRing({ keepMs: half + 2 * KEYFRAME_MS });
    const recorderSession = session.fromPartition('aw-clip-recorder');
    recorderSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        callback({ video: sources[0], audio: 'loopback' });
      } catch (err) {
        log(`[clip] no screen to record: ${err.message || err}`);
        callback({});
      }
    });
    window = new BrowserWindow({
      show: false,
      webPreferences: { preload, session: recorderSession, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    const plan = recordingPlan(clip, screen.getPrimaryDisplay().size.height * (screen.getPrimaryDisplay().scaleFactor || 1));
    window.webContents.on('ipc-message', (_event, channel, payload, data) => {
      if (channel === 'clip-recorder:started') {
        startedAt = Date.now();
        log(`[clip] software recorder started: ${payload}`);
      } else if (channel === 'clip-recorder:chunk' && ring) ring.push(Buffer.from(payload));
      else if (channel === 'clip-recorder:frame-data') settleFrame(payload, data ? Buffer.from(data) : null);
      else if (channel === 'clip-recorder:error') log(`[clip] software recorder: ${payload}`);
    });
    window.webContents.once('did-finish-load', () => window.webContents.send('clip-recorder:start', plan));
    window.loadFile(page);
    cpu.timer = setInterval(() => sampleCpu(app), CPU_SAMPLE_MS);
  }

  // A clip still waiting for its last seconds is written from what was recorded so far.
  function stop() {
    if (pending) {
      clearTimeout(pending.timer);
      const job = pending;
      pending = null;
      writeClip(job.target, job.fromMs, job.toMs);
    }
    if (window && !window.isDestroyed()) window.destroy();
    if (window) reportCost();
    window = null;
    ring = null;
    clip = null;
    startedAt = 0;
    frames.forEach((_waiting, id) => settleFrame(id, null));
  }

  return { start, stop, trigger, grabFrame, running: () => window !== null };
}

module.exports = { createClipRecorder, recordingPlan };
