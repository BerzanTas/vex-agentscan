import { describe, expect, it } from "vitest";
import { solanaOffchainMessageBytes } from "../solana-offchain-message.js";

describe("solanaOffchainMessageBytes", () => {
  it("prefixes the template with 0xFF and the ascii literal 'solana offchain'", () => {
    const template = "line one\nline two";
    const bytes = solanaOffchainMessageBytes(template);

    const expectedPrefix = Buffer.concat([Buffer.from([0xff]), Buffer.from("solana offchain", "ascii")]);
    expect(Buffer.from(bytes.slice(0, expectedPrefix.length))).toEqual(expectedPrefix);
  });

  it("appends the utf8-encoded template after the prefix", () => {
    const template = "hello éworld";
    const bytes = solanaOffchainMessageBytes(template);

    const prefixLength = 1 + "solana offchain".length;
    expect(Buffer.from(bytes.slice(prefixLength))).toEqual(Buffer.from(template, "utf8"));
  });

  it("produces a total length of prefix plus template bytes with no extra bytes", () => {
    const template = "x";
    const bytes = solanaOffchainMessageBytes(template);
    expect(bytes.length).toBe(1 + "solana offchain".length + Buffer.byteLength(template, "utf8"));
  });
});
