import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { makeSolanaChainReader, SolanaTransactionReadError } from "../solana-chain-reader.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused" });
const signature = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const blockTimeSecond = 1_754_300_000;

const solanaEntry: ChainEntry = {
  canonicalSlug: "solana",
  chainFamily: "solana",
  displayName: "Solana",
  explorerTxUrl: () => null,
  rpcUrls: ["http://solana-rpc.test"],
  verificationTier: "basic",
};

function legacyTransactionBody(resultOverrides: Record<string, unknown> = {}): unknown {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      slot: 362_000_000,
      blockTime: blockTimeSecond,
      meta: { err: null, fee: 5000, preBalances: [10_000_000], postBalances: [9_995_000] },
      transaction: {
        message: {
          accountKeys: ["4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"],
          instructions: [],
          recentBlockhash: "9zMNbYzGKcVgZYA1FGVYxDCsDSVCTKLz2Gj5DPByC1nZ",
        },
        signatures: [signature],
      },
      ...resultOverrides,
    },
  };
}

const versionedTransactionBody = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    slot: 362_000_001,
    blockTime: blockTimeSecond,
    version: 0,
    meta: {
      err: null,
      fee: 5000,
      loadedAddresses: {
        readonly: ["So11111111111111111111111111111111111111112"],
        writable: ["9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"],
      },
    },
    transaction: {
      message: {
        accountKeys: ["4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"],
        addressTableLookups: [
          {
            accountKey: "AddressLookupTab1e1111111111111111111111111",
            readonlyIndexes: [1, 2],
            writableIndexes: [0],
          },
        ],
        instructions: [],
        recentBlockhash: "9zMNbYzGKcVgZYA1FGVYxDCsDSVCTKLz2Gj5DPByC1nZ",
      },
      signatures: [signature],
    },
  },
};

type CapturedCall = { url: string; body: unknown };

function stubFetch(respond: (call: CapturedCall) => Response): CapturedCall[] {
  const calls: CapturedCall[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const call = { url, body: JSON.parse(String(init.body)) };
    calls.push(call);
    return Promise.resolve(respond(call));
  });
  return calls;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("makeSolanaChainReader", () => {
  it("requests getTransaction with finalized commitment, version 0 support and json encoding", async () => {
    const calls = stubFetch(() => jsonResponse(legacyTransactionBody()));

    await makeSolanaChainReader(solanaEntry, config).getReceipt(signature);

    expect(calls).toEqual([
      {
        url: "http://solana-rpc.test",
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [signature, { commitment: "finalized", maxSupportedTransactionVersion: 0, encoding: "json" }],
        },
      },
    ]);
  });

  it("maps a transaction without an error to a success receipt carrying the block time", async () => {
    stubFetch(() => jsonResponse(legacyTransactionBody()));

    const receipt = await makeSolanaChainReader(solanaEntry, config).getReceipt(signature);

    expect(receipt).toEqual({
      status: "success",
      blockTimestamp: new Date(blockTimeSecond * 1000),
      erc20Transfers: [],
    });
  });

  it("maps a transaction with a meta error to a reverted receipt", async () => {
    stubFetch(() =>
      jsonResponse(legacyTransactionBody({ meta: { err: { InstructionError: [2, { Custom: 6001 }] }, fee: 5000 } })),
    );

    const receipt = await makeSolanaChainReader(solanaEntry, config).getReceipt(signature);

    expect(receipt).toEqual({
      status: "reverted",
      blockTimestamp: new Date(blockTimeSecond * 1000),
      erc20Transfers: [],
    });
  });

  it("reads a null result as a missing transaction", async () => {
    stubFetch(() => jsonResponse({ jsonrpc: "2.0", id: 1, result: null }));

    const receipt = await makeSolanaChainReader(solanaEntry, config).getReceipt(signature);

    expect(receipt).toBeNull();
  });

  it("parses a versioned transaction with address table lookups", async () => {
    stubFetch(() => jsonResponse(versionedTransactionBody));

    const receipt = await makeSolanaChainReader(solanaEntry, config).getReceipt(signature);

    expect(receipt).toEqual({
      status: "success",
      blockTimestamp: new Date(blockTimeSecond * 1000),
      erc20Transfers: [],
    });
  });

  it("throws a typed error when the block time is missing", async () => {
    stubFetch(() => jsonResponse(legacyTransactionBody({ blockTime: null })));

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("throws a typed error when the transaction carries no meta", async () => {
    stubFetch(() => jsonResponse(legacyTransactionBody({ meta: null })));

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("throws a typed error when the rpc answers with an error envelope", async () => {
    stubFetch(() =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32004, message: "Block not available" } }),
    );

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("throws a typed error when the body is not the documented envelope", async () => {
    stubFetch(() => jsonResponse({ unexpected: true }));

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("throws a typed error when the transport fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNRESET")));

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("throws a typed error when the endpoint answers with an error status", async () => {
    stubFetch(() => new Response("", { status: 502 }));

    await expect(makeSolanaChainReader(solanaEntry, config).getReceipt(signature)).rejects.toBeInstanceOf(
      SolanaTransactionReadError,
    );
  });

  it("prefers configured override urls and falls back to the next url on failure", async () => {
    const overriddenConfig = loadConfig({
      DATABASE_URL: "postgres://unused",
      RPC_URLS_SOLANA: "http://override-a.test,http://override-b.test",
    });
    const calls = stubFetch((call) =>
      call.url === "http://override-a.test" ? new Response("", { status: 500 }) : jsonResponse(legacyTransactionBody()),
    );

    const receipt = await makeSolanaChainReader(solanaEntry, overriddenConfig).getReceipt(signature);

    expect(calls.map((call) => call.url)).toEqual(["http://override-a.test", "http://override-b.test"]);
    expect(receipt?.status).toBe("success");
  });
});
