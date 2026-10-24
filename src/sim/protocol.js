/**
 * Message types exchanged between the renderer and the simulation worker
 * (see docs/design/09-architecture.md, "Protocole Worker ↔ rendu").
 */
export const ToWorker = Object.freeze({
  INIT: 'init',
  SET_SPEED: 'setSpeed',
  PAUSE: 'pause',
  RESUME: 'resume',
});

export const FromWorker = Object.freeze({
  READY: 'ready',
  FRAME: 'frame',
  ERROR: 'error',
});

/** Speed value meaning "as fast as the machine allows". */
export const MAX_SPEED = 'max';
