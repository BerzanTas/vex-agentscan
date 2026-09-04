/**
 * THE TRUST BOUNDARY FOR UPLOADED BYTES. Pure by construction: no `fs`, no
 * Fastify, no I/O - it takes bytes and returns a verdict, which is what makes
 * the whole matrix testable without a disk or a server.
 *
 * Adapted from the Vex desktop locker's validator
 * (`vex-app/src/main/images/image-validation.ts`), whose rules we keep:
 *
 *  - the format is decided by MAGIC BYTES only. The multipart part's declared
 *    `content-type` is never read, because it is written by the uploader;
 *  - dimensions come out of the HEADER. Nothing is decoded or transcoded: no
 *    image codec is installed in this service, so "convert it for them" is not
 *    an option that exists, and a header parser is a far smaller attack
 *    surface than a decoder;
 *  - SIZE is checked before format, so the sniffers only ever walk a buffer
 *    already inside the resource bound;
 *  - anything we cannot positively identify is REFUSED by name, never guessed.
 *
 * WHAT THIS SERVICE ADDS: GIF, which the desktop locker does not accept
 * because Trench's on-chain budget could not carry one. A public host has no
 * such budget, and animated token art is common on the launchpads, so the
 * GIF header (both `87a` and `89a`) is decoded here.
 */

/** The image types this host will store and serve. Nothing else is accepted. */
export const ASSET_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type AssetContentType = (typeof ASSET_CONTENT_TYPES)[number];

/**
 * A header that decodes to zero, or to something no launchpad would ever
 * display, is malformed rather than merely large: we never decode, so an
 * absurd declared canvas is the only signal we have that the file is not what
 * it claims. 8192 is comfortably above every launchpad's display size and
 * still refuses the classic decompression-bomb header.
 */
export const MIN_IMAGE_DIMENSION = 1;
export const MAX_IMAGE_DIMENSION = 8192;

/** Below this a file cannot even carry the smallest header we parse. */
export const MIN_IMAGE_BYTES = 24;

export type ImageRejection =
  | { readonly kind: "too_large"; readonly byteLength: number; readonly maxBytes: number }
  | { readonly kind: "too_small"; readonly byteLength: number }
  | { readonly kind: "unsupported_format"; readonly reason: string };

export type ImageVerdict =
  | {
      readonly ok: true;
      readonly contentType: AssetContentType;
      readonly width: number;
      readonly height: number;
      readonly byteLength: number;
    }
  | { readonly ok: false; readonly rejection: ImageRejection };

type Dimensions = { readonly width: number; readonly height: number };

const reject = (reason: string): ImageVerdict => ({
  ok: false,
  rejection: { kind: "unsupported_format", reason },
});

/** Validate raw upload bytes against the full matrix. `maxBytes` is the caller's size cap. */
export function validateImageBytes(bytes: Uint8Array, maxBytes: number): ImageVerdict {
  const byteLength = bytes.byteLength;
  if (byteLength > maxBytes) {
    return { ok: false, rejection: { kind: "too_large", byteLength, maxBytes } };
  }
  if (byteLength < MIN_IMAGE_BYTES) {
    return { ok: false, rejection: { kind: "too_small", byteLength } };
  }
  const sniffed = sniff(bytes);
  if (sniffed === null) {
    return reject("the bytes are not a PNG, JPEG, WebP or GIF image");
  }
  const dimensions = sniffed.readDimensions(bytes);
  if (dimensions === null) {
    return reject(`the ${sniffed.contentType} header does not carry readable dimensions`);
  }
  if (!isPlausible(dimensions)) {
    return reject(
      `the header declares implausible dimensions (${dimensions.width}x${dimensions.height})`,
    );
  }
  return { ok: true, contentType: sniffed.contentType, ...dimensions, byteLength };
}

function isPlausible({ width, height }: Dimensions): boolean {
  const inBand = (n: number): boolean =>
    Number.isInteger(n) && n >= MIN_IMAGE_DIMENSION && n <= MAX_IMAGE_DIMENSION;
  return inBand(width) && inBand(height);
}

// -- Magic-byte sniffing ---------------------------------------------------

type SniffedFormat = {
  readonly contentType: AssetContentType;
  readonly readDimensions: (bytes: Uint8Array) => Dimensions | null;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function readsAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.byteLength < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function sniff(bytes: Uint8Array): SniffedFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { contentType: "image/png", readDimensions: readPngDimensions };
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { contentType: "image/jpeg", readDimensions: readJpegDimensions };
  }
  if (readsAscii(bytes, 0, "GIF87a") || readsAscii(bytes, 0, "GIF89a")) {
    return { contentType: "image/gif", readDimensions: readGifDimensions };
  }
  // WebP is a RIFF container; the "WEBP" form type at offset 8 is what
  // separates it from a WAV or an AVI wearing the same first four bytes.
  if (readsAscii(bytes, 0, "RIFF") && readsAscii(bytes, 8, "WEBP")) {
    return { contentType: "image/webp", readDimensions: readWebpDimensions };
  }
  return null;
}

// -- Header readers (no decoding - these only parse metadata) ---------------

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * PNG: the IHDR chunk is mandatory and must be FIRST, so its position is
 * fixed - big-endian uint32 width and height at offsets 16 and 20. The "IHDR"
 * tag is verified rather than trusting the signature alone, so a file that
 * borrowed a PNG header but carries something else is refused.
 */
function readPngDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.byteLength < 24) return null;
  if (!readsAscii(bytes, 12, "IHDR")) return null;
  const view = viewOf(bytes);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG: dimensions live in a Start-Of-Frame marker whose position depends on
 * how many APPn/COM segments precede it, so the segment chain is walked.
 *
 * TWO TRAPS, both pinned by tests:
 *  - SOF stores HEIGHT BEFORE WIDTH. Reading them in field order silently
 *    transposes every image;
 *  - `0xFFC4` (DHT), `0xFFC8` (JPG) and `0xFFCC` (DAC) sit inside the
 *    0xC0-0xCF block but are NOT frame headers; treating one as SOF reads
 *    Huffman table bytes as a picture size.
 */
function readJpegDimensions(bytes: Uint8Array): Dimensions | null {
  const view = viewOf(bytes);
  let offset = 2; // past SOI
  while (offset + 9 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null; // desynchronised - refuse, do not hunt
    const marker = bytes[offset + 1];
    if (marker === undefined) return null;
    if (marker === 0xff) {
      offset += 1; // a run of 0xFF is legal padding between segments
      continue;
    }
    if (isStartOfFrame(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return null; // a malformed length would loop forever
    offset += 2 + segmentLength;
  }
  return null;
}

function isStartOfFrame(marker: number): boolean {
  if (marker < 0xc0 || marker > 0xcf) return false;
  return marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * GIF: the Logical Screen Descriptor follows the 6-byte signature directly,
 * carrying width and height as LITTLE-endian uint16 at offsets 6 and 8. Both
 * `GIF87a` and `GIF89a` share this layout; nothing else about the stream is
 * parsed, and in particular no frame is decoded.
 */
function readGifDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.byteLength < 10) return null;
  const view = viewOf(bytes);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/**
 * WebP: three sub-formats, each with its own header layout. All three are
 * supported and anything else is refused rather than guessed:
 *  - `VP8 ` (lossy):    14-bit width/height little-endian after the 3-byte
 *                       `9D 01 2A` start code;
 *  - `VP8L` (lossless): 14-bit width-1/height-1 packed across 4 bytes, behind
 *                       the `0x2F` signature byte;
 *  - `VP8X` (extended): 24-bit canvas width-1/height-1, little-endian.
 * The `-1` bias in VP8L/VP8X is the trap: forgetting it is an off-by-one on
 * every dimension recorded.
 */
function readWebpDimensions(bytes: Uint8Array): Dimensions | null {
  const chunk = 12; // "RIFF" + size + "WEBP"
  if (readsAscii(bytes, chunk, "VP8 ")) return readVp8Lossy(bytes, chunk + 8);
  if (readsAscii(bytes, chunk, "VP8L")) return readVp8Lossless(bytes, chunk + 8);
  if (readsAscii(bytes, chunk, "VP8X")) return readVp8Extended(bytes, chunk + 8);
  return null;
}

function readVp8Lossy(bytes: Uint8Array, frame: number): Dimensions | null {
  if (bytes.byteLength < frame + 10) return null;
  if (bytes[frame + 3] !== 0x9d || bytes[frame + 4] !== 0x01 || bytes[frame + 5] !== 0x2a) {
    return null;
  }
  const view = viewOf(bytes);
  return {
    width: view.getUint16(frame + 6, true) & 0x3fff,
    height: view.getUint16(frame + 8, true) & 0x3fff,
  };
}

function readVp8Lossless(bytes: Uint8Array, frame: number): Dimensions | null {
  if (bytes.byteLength < frame + 5) return null;
  if (bytes[frame] !== 0x2f) return null;
  const packed = viewOf(bytes).getUint32(frame + 1, true);
  return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
}

function readVp8Extended(bytes: Uint8Array, frame: number): Dimensions | null {
  if (bytes.byteLength < frame + 10) return null;
  const at = (index: number): number => bytes[frame + index] ?? 0;
  const width = at(4) | (at(5) << 8) | (at(6) << 16);
  const height = at(7) | (at(8) << 8) | (at(9) << 16);
  return { width: width + 1, height: height + 1 };
}
