/**
 * Image headers built byte by byte, shared by the unit matrix and the
 * integration walk.
 *
 * Checked-in binaries would hide exactly the bytes the assertions are about;
 * these headers ARE the specification being pinned, so they are written out in
 * full. The builders take a `pad` so a fixture can be grown to a chosen byte
 * length without changing the header under test - which is how the size-cap
 * boundary is exercised with a file that is otherwise a valid image.
 */

/** Minimal PNG: signature plus a well-formed IHDR carrying the dimensions. */
export function pngFixture(width: number, height: number, pad = 64): Uint8Array {
  const out = new Uint8Array(33 + pad);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13); // IHDR length
  out.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

/**
 * Minimal JPEG: SOI, an APP0 segment to prove segment-walking works, then an
 * SOF0 frame header carrying the dimensions - height BEFORE width, which is
 * the ordering trap the matrix exists to pin.
 */
export function jpegFixture(width: number, height: number, pad = 64): Uint8Array {
  const head = [
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, length 17, 8-bit precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
  ];
  const out = new Uint8Array(head.length + pad);
  out.set(head, 0);
  return out;
}

/** GIF89a: the Logical Screen Descriptor carries width/height little-endian at 6 and 8. */
export function gifFixture(width: number, height: number, signature = "GIF89a", pad = 32): Uint8Array {
  const out = new Uint8Array(10 + pad);
  out.set(new TextEncoder().encode(signature), 0);
  const view = new DataView(out.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return out;
}

function riffContainer(fourCc: string, payload: number[]): Uint8Array {
  const encoder = new TextEncoder();
  const body = [...encoder.encode("WEBP"), ...encoder.encode(fourCc), ...payload];
  const out = new Uint8Array(8 + body.length);
  out.set(encoder.encode("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** Lossy WebP (`VP8 `): 14-bit width/height little-endian after the `9D 01 2A` start code. */
export function webpLossyFixture(width: number, height: number): Uint8Array {
  const payload = new Array<number>(14).fill(0);
  payload[7] = 0x9d;
  payload[8] = 0x01;
  payload[9] = 0x2a;
  payload[10] = width & 0xff;
  payload[11] = (width >> 8) & 0x3f;
  payload[12] = height & 0xff;
  payload[13] = (height >> 8) & 0x3f;
  return riffContainer("VP8 ", payload);
}

/** Lossless WebP (`VP8L`): 14-bit width-1/height-1 packed behind the `0x2F` signature. */
export function webpLosslessFixture(width: number, height: number): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14);
  return riffContainer("VP8L", [
    0x05, 0x00, 0x00, 0x00,
    0x2f,
    packed & 0xff,
    (packed >> 8) & 0xff,
    (packed >> 16) & 0xff,
    (packed >> 24) & 0xff,
  ]);
}

/** Extended WebP (`VP8X`): 24-bit canvas width-1/height-1, little-endian. */
export function webpExtendedFixture(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return riffContainer("VP8X", [
    0x0a, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff,
    h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff,
  ]);
}

/** Grow a fixture to an exact byte length by padding after the header. */
export function padTo(bytes: Uint8Array, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  out.set(bytes.subarray(0, Math.min(bytes.byteLength, byteLength)), 0);
  return out;
}
