import { describe, expect, it } from 'vitest';
import { createHasher, hashString } from '../../src/sim/core/hash.js';

describe('hash', () => {
  it('matches the FNV-1a reference values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('is order sensitive when combining values', () => {
    const a = createHasher().uint32(1).uint32(2).digest();
    const b = createHasher().uint32(2).uint32(1).digest();
    expect(a).not.toBe(b);
  });

  it('hashes typed arrays by content, not by identity', () => {
    const x = new Float32Array([1.5, -2, 3]);
    const y = new Float32Array([1.5, -2, 3]);
    expect(createHasher().typedArray(x).digest()).toBe(createHasher().typedArray(y).digest());
    y[2] = 3.0001;
    expect(createHasher().typedArray(x).digest()).not.toBe(createHasher().typedArray(y).digest());
  });

  it('formats a digest as 8 hex characters', () => {
    expect(createHasher().uint32(42).hex()).toMatch(/^[0-9a-f]{8}$/);
  });
});
