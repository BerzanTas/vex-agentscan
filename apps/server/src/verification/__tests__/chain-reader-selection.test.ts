import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import type { ChainReaderContext } from "../../worker/verify-job.js";
import { selectChainReader } from "../chain-reader-selection.js";

const config = loadConfig({ DATABASE_URL: "postgres://unused" });

const context: ChainReaderContext = {
  clientConfirmedAt: new Date("2026-08-04T10:00:00Z"),
  executedInRaw: null,
  executedOutRaw: null,
  tokenInAddress: null,
  tokenOutAddress: null,
};

const solanaEntry: ChainEntry = {
  canonicalSlug: "solana",
  chainFamily: "solana",
  displayName: "Solana",
  explorerTxUrl: () => null,
  rpcUrls: ["http://solana-rpc.test"],
  verificationTier: "basic",
};

const baseEntry: ChainEntry = {
  canonicalSlug: "base",
  chainFamily: "eip155",
  displayName: "Base",
  explorerTxUrl: () => null,
  rpcUrls: ["http://evm-rpc.test"],
  verificationTier: "full",
};

type RpcCall = { url: string; method: string };

function stubRpc(): RpcCall[] {
  const calls: RpcCall[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number; method: string };
    calls.push({ url, method: body.method });
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectChainReader", () => {
  it("reads a solana entry through the native getTransaction rpc", async () => {
    const calls = stubRpc();

    const receipt = await selectChainReader(solanaEntry, config, context).getReceipt("signature111");

    expect(calls).toEqual([{ url: "http://solana-rpc.test", method: "getTransaction" }]);
    expect(receipt).toBeNull();
  });

  it("reads an eip155 entry through the evm receipt rpc", async () => {
    const calls = stubRpc();

    const receipt = await selectChainReader(baseEntry, config, context).getReceipt("0xabc");

    expect(calls.map((call) => call.method)).toEqual(["eth_getTransactionReceipt"]);
    expect(calls[0]?.url).toBe("http://evm-rpc.test/");
    expect(receipt).toBeNull();
  });

  it("confirms every family from the declared context in confirm_all mode without touching any rpc", async () => {
    const fakeModeConfig = loadConfig({ DATABASE_URL: "postgres://unused", VERIFY_FAKE_MODE: "confirm_all" });
    const calls = stubRpc();

    const solanaReceipt = await selectChainReader(solanaEntry, fakeModeConfig, context).getReceipt("signature111");
    const evmReceipt = await selectChainReader(baseEntry, fakeModeConfig, context).getReceipt("0xabc");

    expect(calls).toEqual([]);
    expect(solanaReceipt).toEqual({
      status: "success",
      blockTimestamp: context.clientConfirmedAt,
      erc20Transfers: [],
      transactionValueRaw: null,
    });
    expect(evmReceipt).toEqual(solanaReceipt);
  });
});
