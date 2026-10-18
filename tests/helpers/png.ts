import zlib from "node:zlib";

/**
 * A real PNG, encoded properly — signature, IHDR, deflate-compressed IDAT and
 * correct CRCs — so anything that parses it has nothing to object to.
 *
 * Written by hand rather than pasted as base64 because the tests that use it
 * are asserting that a *genuine image* goes through the pipeline. A constant
 * that happened to satisfy one parser version would be a weaker claim, and
 * one that was subtly malformed would make every downstream failure a
 * mystery.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.concat([
    Buffer.from(body.length.toString(16).padStart(8, "0"), "hex"),
    Buffer.from(type, "latin1"),
    Buffer.from(body),
  ]);
  const out = Buffer.concat([head, Buffer.alloc(4)]);
  out.writeUInt32BE(crc32(head), head.length);
  return out;
}

/**
 * Builds an image of the given size. Small on purpose: these fixtures exist to
 * exercise the code paths, not to look like anything, and a 40×30 image
 * compresses to a few hundred bytes.
 */
export function buildPng(widthPx: number, heightPx: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, widthPx);
  view.setUint32(4, heightPx);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB, no alpha

  const raw = Buffer.alloc(heightPx * (1 + widthPx * 3));
  for (let y = 0; y < heightPx; y += 1) {
    const row = y * (1 + widthPx * 3);
    for (let x = 0; x < widthPx; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = (x * 7 + y * 3) % 256;
      raw[i + 1] = (x * 3 + y * 11) % 256;
      raw[i + 2] = (x + y) % 256;
    }
  }

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlib.deflateSync(raw)),
      pngChunk("IEND", new Uint8Array(0)),
    ]),
  );
}

/** A 1×1 baseline JPEG, enough for pdf-lib to parse and embed. */
export const TINY_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
      "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA" +
      "/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEA" +
      "AD8AKp//2Q==",
    "base64",
  ),
);
