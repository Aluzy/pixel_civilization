import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/core/rng.js';
import { WORLD_TABLES } from '../../src/sim/simulation.js';
import { ChunkStore } from '../../src/sim/world/chunk-store.js';
import { CHUNK_SIZE } from '../../src/sim/world/coords.js';
import { WorldGenerator } from '../../src/sim/world/generator.js';
import { ChunkStreamer } from '../../src/worker/chunk-streamer.js';

/** @returns {ChunkStore} */
function store() {
  return new ChunkStore(new WorldGenerator(createRng(1).fork('g'), WORLD_TABLES));
}

/**
 * @param {ChunkStreamer} streamer
 * @returns {string[]}
 */
function drain(streamer) {
  const out = [];
  for (let c = streamer.next(); c; c = streamer.next()) out.push(`${c.cx},${c.cy}`);
  return out;
}

const ONE_CHUNK = { x0: 0, y0: 0, x1: CHUNK_SIZE - 1, y1: CHUNK_SIZE - 1 };

describe('ChunkStreamer', () => {
  it('sends the visible chunks plus a margin, the visible one first', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 1, keepMargin: 2 });
    s.setViewport(ONE_CHUNK);
    const sent = drain(s);
    expect(sent).toHaveLength(9);
    expect(sent[0]).toBe('0,0');
  });

  it('never sends the same chunk twice while it stays in view', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 1, keepMargin: 2 });
    s.setViewport(ONE_CHUNK);
    drain(s);
    s.setViewport({ x0: 10, y0: 10, x1: CHUNK_SIZE + 10, y1: CHUNK_SIZE - 1 });
    const second = drain(s);
    expect(second[0]).toBe('2,0');
    expect([...second].sort()).toEqual(['2,-1', '2,0', '2,1']);
  });

  it('forgets chunks beyond the keep margin, so they are sent again on return', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 0, keepMargin: 1 });
    s.setViewport(ONE_CHUNK);
    expect(drain(s)).toEqual(['0,0']);
    const far = CHUNK_SIZE * 10;
    s.setViewport({ x0: far, y0: 0, x1: far + 1, y1: 1 });
    drain(s);
    s.setViewport(ONE_CHUNK);
    expect(drain(s)).toEqual(['0,0']);
  });

  it('drops queued chunks that left the view before being sent', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 1, keepMargin: 1 });
    s.setViewport(ONE_CHUNK);
    s.next();
    const far = CHUNK_SIZE * 50;
    s.setViewport({ x0: far, y0: far, x1: far + 1, y1: far + 1 });
    const sent = drain(s);
    expect(sent).toHaveLength(9);
    const nearFar = (key) => ['49', '50', '51'].includes(key.split(',')[0]);
    expect(sent.every(nearFar)).toBe(true);
  });
});

describe('ChunkStreamer resending', () => {
  it('sends a changed chunk again, first, and keeps it queued across view changes', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 1, keepMargin: 2 });
    s.setViewport(ONE_CHUNK);
    drain(s);
    s.resend(1, 1);
    s.resend(1, 1);
    s.setViewport({ x0: 5, y0: 5, x1: CHUNK_SIZE - 5, y1: CHUNK_SIZE - 5 });
    expect(drain(s)).toEqual(['1,1']);
  });

  it('ignores changes to chunks the renderer does not hold', () => {
    const s = new ChunkStreamer(store(), { sendMargin: 0, keepMargin: 0 });
    s.setViewport(ONE_CHUNK);
    drain(s);
    s.resend(30, 30);
    expect(drain(s)).toEqual([]);
  });
});
