/**
 * THE UPLOAD TRUST BOUNDARY, tested as a matrix rather than a happy path.
 *
 * The rules under test, each of which is a defect if it stops holding:
 *  - the type is decided by MAGIC BYTES; nothing a caller declares is read;
 *  - dimensions come out of the HEADER, with no decode and no transcode;
 *  - the size cap is checked FIRST, so a 30 MB PDF is told it is too large
 *    rather than lectured about its magic bytes, and the sniffers only ever
 *    walk a buffer already inside the bound;
 *  - anything not positively identified is REFUSED, never guessed.
 */

import { describe, expect, it } from "vitest";
import { MAX_IMAGE_DIMENSION, MIN_IMAGE_BYTES, validateImageBytes } from "../image-bytes.js";
import {
  gifFixture,
  jpegFixture,
  padTo,
  pngFixture,
  webpExtendedFixture,
  webpLosslessFixture,
  webpLossyFixture,
} from "./image-fixtures.js";

const CAP = 2 * 1024 * 1024;
const verdictOf = (bytes: Uint8Array, cap = CAP) => validateImageBytes(bytes, cap);
const rejectionKind = (bytes: Uint8Array, cap = CAP): string => {
  const verdict = verdictOf(bytes, cap);
  return verdict.ok ? "accepted" : verdict.rejection.kind;
};

describe("validateImageBytes - the accepted formats", () => {
  it("accepts a PNG and reads its dimensions from IHDR", () => {
    expect(verdictOf(pngFixture(320, 200))).toMatchObject({
      ok: true,
      contentType: "image/png",
      width: 320,
      height: 200,
    });
  });

  it("accepts a JPEG, walks past APP0 to SOF0, and does not transpose height/width", () => {
    // The trap: SOF0 stores HEIGHT first. A reader that takes the fields in
    // order returns 480x640 and every dimension this host records is wrong.
    expect(verdictOf(jpegFixture(640, 480))).toMatchObject({
      ok: true,
      contentType: "image/jpeg",
      width: 640,
      height: 480,
    });
  });

  it.each([
    ["GIF89a", "GIF89a"],
    ["GIF87a", "GIF87a"],
  ])("accepts a %s and reads its little-endian screen descriptor", (_name, signature) => {
    expect(verdictOf(gifFixture(48, 96, signature))).toMatchObject({
      ok: true,
      contentType: "image/gif",
      width: 48,
      height: 96,
    });
  });

  it.each([
    ["lossy VP8 ", webpLossyFixture(256, 144)],
    ["lossless VP8L", webpLosslessFixture(256, 144)],
    ["extended VP8X", webpExtendedFixture(256, 144)],
  ])("accepts a %s WebP with the -1 bias applied where the format has one", (_name, bytes) => {
    expect(verdictOf(bytes)).toMatchObject({
      ok: true,
      contentType: "image/webp",
      width: 256,
      height: 144,
    });
  });
});

describe("validateImageBytes - what a declared type cannot do", () => {
  it("names the type from the bytes, whatever the file was called or claimed", () => {
    // This is the whole reason the validator takes bytes and nothing else: it
    // has no parameter through which a lie could arrive. A caller sending GIF
    // bytes under `Content-Type: image/png` gets `image/gif` here and, at the
    // route, a `.gif` URL.
    const verdict = verdictOf(gifFixture(10, 10));
    expect(verdict).toMatchObject({ ok: true, contentType: "image/gif" });
  });

  it("refuses bytes that are not one of the four formats", () => {
    const pdf = new Uint8Array(64);
    pdf.set(new TextEncoder().encode("%PDF-1.7"), 0);
    expect(rejectionKind(pdf)).toBe("unsupported_format");
  });

  it("refuses a RIFF container that is not WebP", () => {
    const wav = new Uint8Array(64);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVE"), 8);
    expect(rejectionKind(wav)).toBe("unsupported_format");
  });

  it("refuses a PNG signature whose first chunk is not IHDR", () => {
    const forged = pngFixture(10, 10);
    forged.set(new TextEncoder().encode("sRGB"), 12);
    expect(rejectionKind(forged)).toBe("unsupported_format");
  });

  it("refuses a JPEG whose only 0xC-block marker is a Huffman table, not a frame", () => {
    // 0xFFC4 (DHT) sits inside 0xC0-0xCF but is not a frame header; reading it
    // as SOF would report Huffman table bytes as a picture size.
    const bytes = new Uint8Array(64);
    bytes.set([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x14], 0);
    expect(rejectionKind(bytes)).toBe("unsupported_format");
  });
});

describe("validateImageBytes - the bounds", () => {
  it("accepts a file of exactly the cap and refuses the very next byte", () => {
    expect(rejectionKind(padTo(pngFixture(8, 8), CAP))).toBe("accepted");
    expect(rejectionKind(padTo(pngFixture(8, 8), CAP + 1))).toBe("too_large");
  });

  it("reports too_large before it looks at the format, so a large PDF is told the truth", () => {
    const pdf = new Uint8Array(CAP + 1);
    pdf.set(new TextEncoder().encode("%PDF-1.7"), 0);
    expect(rejectionKind(pdf)).toBe("too_large");
  });

  it("refuses a file too short to carry any header we parse", () => {
    expect(rejectionKind(new Uint8Array(MIN_IMAGE_BYTES - 1))).toBe("too_small");
  });

  it.each([
    ["a zero dimension", pngFixture(0, 10)],
    ["a dimension past the plausibility band", pngFixture(MAX_IMAGE_DIMENSION + 1, 10)],
  ])("refuses %s declared in the header", (_name, bytes) => {
    expect(rejectionKind(bytes)).toBe("unsupported_format");
  });

  it("accepts the largest plausible dimension", () => {
    expect(rejectionKind(pngFixture(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))).toBe("accepted");
  });
});
