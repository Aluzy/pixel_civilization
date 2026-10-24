// Pure camera geometry, matching Phaser's camera model: zoom scales around the viewport centre,
// and `scroll` is the world position of the viewport's top-left corner at zoom 1.

/**
 * @typedef {object} CameraView
 * @property {number} scrollX
 * @property {number} scrollY
 * @property {number} zoom
 * @property {number} width - Viewport width in screen pixels.
 * @property {number} height - Viewport height in screen pixels.
 */

/**
 * World rectangle shown by the camera.
 * @param {CameraView} view
 * @returns {{ x0: number, y0: number, x1: number, y1: number }}
 */
export function visibleRect({ scrollX, scrollY, zoom, width, height }) {
  const x0 = scrollX + width / 2 - width / (2 * zoom);
  const y0 = scrollY + height / 2 - height / (2 * zoom);
  return { x0, y0, x1: x0 + width / zoom, y1: y0 + height / zoom };
}

/**
 * Scroll that keeps the world point under `pointer` in place when changing zoom.
 * @param {CameraView} view
 * @param {{ x: number, y: number }} pointer - Screen position.
 * @param {number} newZoom
 * @returns {{ scrollX: number, scrollY: number }}
 */
export function scrollToKeepPoint(view, pointer, newZoom) {
  const { scrollX, scrollY, zoom, width, height } = view;
  const wx = scrollX + width / 2 + (pointer.x - width / 2) / zoom;
  const wy = scrollY + height / 2 + (pointer.y - height / 2) / zoom;
  return {
    scrollX: wx - width / 2 - (pointer.x - width / 2) / newZoom,
    scrollY: wy - height / 2 - (pointer.y - height / 2) / newZoom,
  };
}

/**
 * Next zoom level up (direction 1) or down (-1), clamped to the steps.
 * @param {number} zoom
 * @param {1 | -1} direction
 * @param {number[]} steps - Increasing zoom levels.
 * @returns {number}
 */
export function nextZoom(zoom, direction, steps) {
  if (direction > 0) return steps.find((s) => s > zoom + 1e-9) ?? steps[steps.length - 1];
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] < zoom - 1e-9) return steps[i];
  return steps[0];
}
