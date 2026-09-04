import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReceiptLog } from "@agentscan/core";
import { decodeCreationEvents } from "../creation-events.js";

/**
 * These run over REAL RECEIPTS fetched from the chains on 2026-09-04 (see `fixtures/README.md`).
 * A decoder written against a hand-made log proves only that the encoder and the decoder agree with
 * each other; these prove the decoder reads what the launchpads actually emitted.
 */
type ReceiptFixture = {
  txHash: string;
  status: string;
  blockNumber: string;
  transactionFrom: string;
  transactionTo: string | null;
  logs: ReceiptLog[];
};

function fixture(name: string): ReceiptFixture {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"),
  ) as ReceiptFixture;
}

const poolsLaunch = fixture("pools-v3-gateway-launch");
const virtualsPreLaunch = fixture("virtuals-robinhood-prelaunch");
const virtualsKeeperLaunch = fixture("virtuals-base-keeper-launch");

const POOLS_V3_GATEWAY = "0x2bc81783ed0fdd8b04604ff93fa3872212cac429";
const POOLS_LAUNCHER = "0x848e5738fd6f7fb4a7a7141702edcde4b8ad2450";
const POOLS_TOKEN = "0x00e802805a16ad3aa879f98f21a1213545bb98b9";

const VIRTUALS_BONDING_V5_ROBINHOOD = "0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007";
const VIRTUALS_TOKEN = "0xd1ef7097c42d2a94033148aec7ca70235dcdc411";

describe("the pools.fun GatewayLaunch decoder, over a real V3 launch receipt", () => {
  const events = decodeCreationEvents("pools_fun", poolsLaunch.logs);

  it("finds exactly one launch in a receipt of 44 logs", () => {
    expect(events).toHaveLength(1);
  });

  // The launcher is the human. `PartyFactory.TokenLaunched`, also in this receipt, names the
  // GATEWAY as creator on this path, so a decoder built on it would credit a contract with every
  // pools.fun launch ever made.
  it("names the launcher as the creator, and the gateway as the emitter", () => {
    expect(events[0]).toEqual({
      emitterAddress: POOLS_V3_GATEWAY,
      tokenAddress: POOLS_TOKEN,
      creatorAddress: POOLS_LAUNCHER,
    });
  });

  it("agrees with the transaction envelope: the launcher called the gateway directly", () => {
    expect(poolsLaunch.transactionFrom).toBe(POOLS_LAUNCHER);
    expect(poolsLaunch.transactionTo).toBe(POOLS_V3_GATEWAY);
  });
});

describe("the Virtuals PreLaunched decoder, over the real creator preLaunch receipt", () => {
  const events = decodeCreationEvents("virtuals", virtualsPreLaunch.logs);

  it("finds the agent creation and names its token", () => {
    expect(events).toEqual([
      {
        emitterAddress: VIRTUALS_BONDING_V5_ROBINHOOD,
        tokenAddress: VIRTUALS_TOKEN,
        creatorAddress: null,
      },
    ]);
  });

  // The null creator is the point: `PreLaunched` carries no creator field, so the decoder says so
  // rather than reaching for some address in the receipt that looks plausible.
  it("names no creator, because the event carries none", () => {
    expect(events[0]?.creatorAddress).toBeNull();
  });

  it("came from the creator's own wallet, sent to the allowlisted BondingV5", () => {
    expect(virtualsPreLaunch.transactionFrom).toBe("0x33ef6673bd80cb11fcc41b82bc2181e65cc4d2fa");
    expect(virtualsPreLaunch.transactionTo).toBe(VIRTUALS_BONDING_V5_ROBINHOOD);
  });
});

/**
 * THE KEEPER RECEIPT. `launch()` is executed by the protocol's keeper, in the keeper's own
 * transaction, seconds after the creator's `preLaunch`. It emits `Launched`, and a verifier that
 * decoded that event would attribute every Virtuals agent to the keeper's address.
 */
describe("the Virtuals decoder, over the real KEEPER launch receipt", () => {
  it("decodes no creation event from it at all", () => {
    expect(decodeCreationEvents("virtuals", virtualsKeeperLaunch.logs)).toEqual([]);
  });

  it("was sent by the keeper, not by the creator", () => {
    expect(virtualsKeeperLaunch.transactionFrom).toBe("0x81f7ca6af86d1ca6335e44a2c28bc88807491415");
    expect(virtualsKeeperLaunch.transactionTo).toBe("0x1a540088125d00dd3990f9da45ca0859af4d3b01");
  });
});

/**
 * ONE LAUNCHPAD, ONE DECODER. Every decoder must be blind to the other launchpads' receipts, or the
 * dispatch would be decoration: an attacker could then claim any launchpad and have some decoder
 * find something.
 */
describe("cross-launchpad blindness", () => {
  it.each([
    ["trench", poolsLaunch],
    ["trench", virtualsPreLaunch],
    ["pools_fun", virtualsPreLaunch],
    ["pools_fun", virtualsKeeperLaunch],
    ["virtuals", poolsLaunch],
  ] as const)("decodes nothing when %s is claimed over another launchpad's receipt", (launchpad, receipt) => {
    expect(decodeCreationEvents(launchpad, receipt.logs)).toEqual([]);
  });
});
