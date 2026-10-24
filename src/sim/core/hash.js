// FNV-1a, 32 bits: tiny, fast and stable across platforms, enough to compare simulation states.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const encoder = new TextEncoder();

/**
 * Incremental FNV-1a hasher. Methods return the hasher so calls can be chained.
 */
export class Hasher {
  constructor() {
    /** @type {number} */
    this.state = FNV_OFFSET;
  }

  /**
   * @param {number} byte - Value in [0, 255].
   * @returns {Hasher}
   */
  byte(byte) {
    this.state = Math.imul(this.state ^ (byte & 0xff), FNV_PRIME) >>> 0;
    return this;
  }

  /**
   * Hashes a 32-bit unsigned integer, little-endian.
   * @param {number} value
   * @returns {Hasher}
   */
  uint32(value) {
    const v = value >>> 0;
    return this.byte(v)
      .byte(v >>> 8)
      .byte(v >>> 16)
      .byte(v >>> 24);
  }

  /**
   * Hashes the raw bytes of a typed array (its content, not its identity).
   * @param {ArrayBufferView} array
   * @returns {Hasher}
   */
  typedArray(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let h = this.state;
    for (let i = 0; i < bytes.length; i++) {
      h = Math.imul(h ^ bytes[i], FNV_PRIME) >>> 0;
    }
    this.state = h;
    return this;
  }

  /**
   * @param {string} text - Hashed as UTF-8.
   * @returns {Hasher}
   */
  string(text) {
    return this.typedArray(encoder.encode(text));
  }

  /** @returns {number} Unsigned 32-bit digest. */
  digest() {
    return this.state >>> 0;
  }

  /** @returns {string} Digest as 8 lowercase hex characters. */
  hex() {
    return this.digest().toString(16).padStart(8, '0');
  }
}

/** @returns {Hasher} */
export function createHasher() {
  return new Hasher();
}

/**
 * @param {string} text
 * @returns {number} FNV-1a digest of the UTF-8 bytes.
 */
export function hashString(text) {
  return new Hasher().string(text).digest();
}
