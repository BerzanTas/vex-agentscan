import { describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@agentscan/core";
import { loadConfig } from "../../config.js";
import { makeChainReader } from "../viem-chain-reader.js";

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
  chainFamily: "eip155",
  displayName: "Base",
  explorerTxUrl: () => null,
  rpcUrls: ["https://rpc.example"],
  verificationTier: "full",
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
    client.getTransaction.mockResolvedValue({
      value: 1000000000000000000n,
      from: "0xAAbb",
      to: "0xCCdd",
    });

    const view = await makeChainReader(entry, config).getReceipt(txHash);

    expect(view?.transactionValueRaw).toBe("1000000000000000000");
    expect(client.getTransaction).toHaveBeenCalledWith({ hash: txHash });
  });

  // The envelope is the Virtuals creator proof, and it is read from the same call as the value, so
  // one transaction read serves both. Addresses are lowercased here rather than at every comparison.
  it("threads the transaction sender and target into the receipt view, lowercased", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockResolvedValue({ value: 0n, from: "0xAAbb", to: "0xCCdd" });

    const view = await makeChainReader(entry, config).getReceipt(txHash);

    expect(view?.transactionFrom).toBe("0xaabb");
    expect(view?.transactionTo).toBe("0xccdd");
  });

  it("carries a null target for a contract-creation transaction rather than inventing one", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockResolvedValue({ value: 0n, from: "0xAAbb", to: null });

    const view = await makeChainReader(entry, config).getReceipt(txHash);

    expect(view?.transactionTo).toBeNull();
  });

  // Undefined, not null: "the reader could not read it" and "there was no target" are different
  // facts, and only the first one may be retried.
  it("leaves the envelope undefined when the transaction fetch fails", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockRejectedValue(new Error("rpc down"));

    const view = await makeChainReader(entry, config).getReceipt(txHash);

    expect(view?.transactionFrom).toBeUndefined();
    expect(view?.transactionTo).toBeUndefined();
  });

  it("returns the receipt with a null transaction value when the transaction fetch fails", async () => {
    arrangeMinedTransaction();
    client.getTransaction.mockRejectedValue(new Error("rpc down"));

    const view = await makeChainReader(entry, config).getReceipt(txHash);

    expect(view).toEqual({
      status: "success",
      blockTimestamp: new Date(1753876800 * 1000),
      blockNumber: 100n,
      erc20Transfers: [],
      transactionValueRaw: null,
      transactionFrom: undefined,
      transactionTo: undefined,
      logs: [],
    });
  });
});
