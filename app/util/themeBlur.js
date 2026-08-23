'use strict';

/*
  The blur and veil copies a theme's image layers are drawn from. A layer with an effect is not
  painted from its source image: the blur is baked into a generated copy so the element's own content
  stays crisp. This lives here, not in the main process, because three places (the Custom editor, an
  .awtheme import, and the gallery renderer) have to produce identical copies or a theme looks
  different in each. `sharp` is required lazily, so importing this module costs nothing on a start
  that never blurs.
*/

const fs = require('fs');
const path = require('path');

const { IMAGE_LAYER_IDS } = require('./themeLayers.js');
const { isDerivedUpToDate } = require('./themeImages.js');

// The blur effect follows the user's intensity slider; the veil uses a fixed light frost.
const VEIL_SIGMA = 1.2;
const MAX_SIGMA = 12;
// Wide enough for any display the window opens on, and a ceiling on what one blur costs.
const RESIZE_WIDTH = 2560;

function sigmaFor(effect) {
  return effect.type === 'blur' ? Math.max(0.3, Math.min(MAX_SIGMA, effect.blur / 5)) : VEIL_SIGMA;
}

// Named after the layer, the source and the effect, so a blur copy and a veil copy of one image
// never overwrite each other and a copy that is already correct is recognised by its name.
function derivedName(id, image, effect) {
  const extension = path.extname(image).toLowerCase() || '.png';
  const stem = path.basename(image, extension).replace(/[^a-z0-9-_]/gi, '_').slice(0, 40) || 'image';
  const suffix = effect.type === 'blur' ? `blur-${effect.blur}` : `veilblur-${sigmaFor(effect)}`;
  return `${id}-${stem}-${suffix}.png`;
}

/*
  Fills in `effect.blurImage` for every image layer that asks for an effect, writing copies into
  `intoDir`. Mutates and returns `theme`, since every caller goes on to persist or render it. A layer
  whose copy cannot be made is left with an empty `blurImage` rather than a broken path, so it falls
  back to drawing from its source image.
*/
async function prepareThemeBlurImages(theme, intoDir, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};

  for (const id of IMAGE_LAYER_IDS) {
    const layer = theme && theme[id];
    if (!layer || !layer.effect || layer.effect.enabled !== true) continue;
    if (!layer.image || !fs.existsSync(layer.image)) {
      layer.effect.blurImage = '';
      continue;
    }

    try {
      fs.mkdirSync(intoDir, { recursive: true });
      const destination = path.join(intoDir, derivedName(id, layer.image, layer.effect));
      // The editor autosaves on every change, so this re-blurred every layer (~250 ms each on a
      // 7 MB image) for a file the name already says is correct.
      if (isDerivedUpToDate(layer.image, destination)) {
        layer.effect.blurImage = destination;
        continue;
      }
      const sharp = require('sharp');
      await sharp(layer.image)
        .resize({ width: RESIZE_WIDTH, withoutEnlargement: true })
        .blur(sigmaFor(layer.effect))
        .png()
        .toFile(destination);
      layer.effect.blurImage = destination;
    } catch (err) {
      log(`[theme-image] blur failed for ${id}: ${err.message || err}`);
      layer.effect.blurImage = '';
    }
  }
  return theme;
}

module.exports = { prepareThemeBlurImages, derivedName, sigmaFor, VEIL_SIGMA, RESIZE_WIDTH };
