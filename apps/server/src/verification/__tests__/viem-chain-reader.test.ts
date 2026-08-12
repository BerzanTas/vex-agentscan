import { describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { makeChainReader } from "../viem-chain-reader.js";
import type { ChainReaderContext } from "../../worker/verify-job.js";

const client = vi.hoisted(() => ({
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createPublicClient: () => client };
});

const config = loadConfig({ DATABASE_URL: "postgres://unused" });

const entry: ChainEntry = {
  canonicalSlug: "base",
  displayName: "Base",
  explorerTxUrl: () => null,
  rpcUrls: ["https://rpc.example"],
  verificationTier: "full",
};

const context: ChainReaderContext = {
  clientConfirmedAt: null,
  executedInRaw: null,
  executedOutRaw: null,
  tokenInAddress: null,
  tokenOutAddress: null,
};

const txHash = `0x${"1".repeat(64)}`;

const minedReceipt = {
  status: "success",
  blockHash: `0x${"2".repeat(64)}`,
  blockNumber: 100n,
  logs: [],
};

function arrangeMinedTransaction() {
  client.getTransactionReceipt.mockResolvedValue(minedReceipt);
  client.getBlock.mockResolvedValue({ timestamp: 1753876800n });
}

describe("makeChainReader", () => {
  it("threads the transaction value into the receipt view", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockResolvedValue({ value: 1000000000000000000n });

    const view = await makeChainReader(entry, config, context).getReceipt(txHash);

    expect(view?.transactionValueRaw).toBe("1000000000000000000");
    expect(client.getTransaction).toHaveBeenCalledWith({ hash: txHash });
  });

  it("returns the receipt with a null transaction value when the transaction fetch fails", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockRejectedValue(new Error("rpc down"));

    const view = await makeChainReader(entry, config, context).getReceipt(txHash);

    expect(view).toEqual({
      status: "success",
      blockTimestamp: new Date(1753876800 * 1000),
      blockNumber: 100n,
      erc20Transfers: [],
      transactionValueRaw: null,
      logs: [],
    });
  });
});
