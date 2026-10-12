'use strict';

// Lets the stylesheet hide what only exists on one system ([data-windows-only]).
document.documentElement.dataset.platform = process.platform;
