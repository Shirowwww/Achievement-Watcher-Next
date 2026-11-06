'use strict';

// A DOM element with an optional class and text, shared by the preset designer's panels.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

module.exports = { el };
