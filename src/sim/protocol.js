/**
 * Message types exchanged between the renderer and the simulation worker
 * (see docs/design/09-architecture.md, "Protocole Worker ↔ rendu").
 */
export const ToWorker = Object.freeze({
  INIT: 'init',
  SET_SPEED: 'setSpeed',
  PAUSE: 'pause',
  RESUME: 'resume',
  VIEWPORT: 'viewport',
  SELECT: 'select',
  SKIP: 'skip',
});

/** Kinds of "fast-forward until…" requests. */
export const SkipKind = Object.freeze({
  DAWN: 'dawn',
  EVENT: 'event',
});

export const FromWorker = Object.freeze({
  READY: 'ready',
  FRAME: 'frame',
  CHUNK: 'chunk',
  ERROR: 'error',
});

/** Chunks sent around the visible area, and kept by the renderer (in chunks). */
export const CHUNK_SEND_MARGIN = 1;
export const CHUNK_KEEP_MARGIN = 2;

/** Speed value meaning "as fast as the machine allows". */
export const MAX_SPEED = 'max';
