'use strict';

/*
  Settings rows that only mean something while another one is on. The panel dims them
  (`is-inactive`, the pattern the trophy thresholds already use) instead of hiding them: the row
  keeps its place, the translation bound to it keeps working, and its value is never touched.
  Pure on purpose, so the whole table is testable without a DOM.
*/

const OVERLAY_ONLY = [
  'option_overlayPreset',
  'option_overlayPresetXenia',
  'option_overlayPresetRpcs3',
  'option_overlayPresetShadps4',
  'option_overlayPosition',
  'option_overlayScale',
  'option_overlayProgressPosition',
  'option_overlayProgressScale',
  'option_overlayDuration',
  'option_overlaySound',
  'option_overlayVolume',
];

const CONTROLLER_BINDINGS = [
  'option_controllerToggle1',
  'option_controllerUi1',
  'option_controllerMove1',
  'option_controllerFocusOverlay',
  'option_controllerSendEscape',
];

const on = (value) => String(value) === 'true';

/*
  Each rule names the controls it dims and when they are live, given the current value of every
  select (as strings, exactly what `$(select).val()` returns).
*/
const RULES = [
  // Merging is what the timestamp rule resolves.
  { controls: ['option_timeMergeRecentFirst'], live: (v) => on(v.option_mergeDuplicate) },
  // The milestone step throttles progress notifications, which must be on to be throttled.
  { controls: ['option_progressStep'], live: (v) => v.option_notifyOnProgress !== 'false' },
  // The transport mode decides which kind of notification exists at all.
  { controls: ['option_groupToast', 'option_urgent'], live: (v) => v.option_notifMode !== 'overlay' },
  { controls: OVERLAY_ONLY, live: (v) => v.option_notifMode !== 'toast' },
  // HDR only changes how a screenshot is taken.
  { controls: ['option_souvenirHdr'], live: (v) => on(v.option_souvenirScreenshot) },
  // Bindings drive the in-game overlay; layout and backend serve both controller features.
  { controls: CONTROLLER_BINDINGS, live: (v) => on(v.option_controllerEnabled) },
  { controls: ['option_controllerLayout', 'option_controllerBackend'], live: (v) => on(v.option_controllerEnabled) || on(v.option_controllerAppNavigation) },
];

// Ids of every control a rule currently dims.
function inactiveControls(values) {
  const out = new Set();
  for (const rule of RULES) {
    if (!rule.live(values || {})) rule.controls.forEach((id) => out.add(id));
  }
  return out;
}

// Every select id a rule reads, so the panel knows which changes to react to.
function watchedControls() {
  const names = new Set();
  const probe = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === 'string') names.add(key);
        return '';
      },
    }
  );
  RULES.forEach((rule) => rule.live(probe));
  return [...names];
}

// Every control any rule can dim.
function dimmableControls() {
  return [...new Set(RULES.flatMap((rule) => rule.controls))];
}

module.exports = { RULES, inactiveControls, watchedControls, dimmableControls };
