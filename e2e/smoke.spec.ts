import { expect, test, type APIRequestContext } from "@playwright/test";

const agentHash = "c0dec0de".repeat(8);
const ingestToken = `smoke_${"A".repeat(37)}`;

const goldenSwap = (nowIso: string) => ({
  sourceRowId: "44210",
  sourceExecutionId: "9021",
  eventIndex: 0,
  kind: "swap",
  eventRole: "swap",
  status: "confirmed",
  protocol: "kyberswap",
  chainFamily: "eip155",
  chainId: 4663,
  fromChainId: null,
  toChainId: null,
  tokenIn: { address: "0xabc", symbol: "ETH", decimals: 18 },
  tokenOut: { address: "0xdef", symbol: "VEX", decimals: 18 },
  amountInRaw: "1000000000000000000",
  amountOutRaw: "2410000000000000000000",
  executedInRaw: null,
  executedOutRaw: null,
  usdInEst: "3312.44",
  usdOutEst: "3305.12",
  usdFeeEst: "3.31",
  usdSource: "kyberswap_quote",
  txHash: "0x123",
  failureCode: null,
  createdAt: nowIso,
  confirmedAt: nowIso,
  observedAt: null,
});

type EventsResult = { accepted: number; duplicates: number; rejected: unknown[] };

async function seedGoldenSwap(request: APIRequestContext): Promise<void> {
  const nowIso = new Date().toISOString();
  const registered = await request.post("/v1/agents/register", {
    data: {
      agentHash,
      ingestToken,
      consentVersion: 1,
      acceptedAt: nowIso,
      appVersion: "smoke",
    },
  });
  expect(registered.status()).toBe(200);
  expect(await registered.json()).toEqual({ status: "registered" });

  const ingested = await request.post("/v1/events", {
    headers: { authorization: `Bearer ${ingestToken}` },
    data: { schemaVersion: 1, agentHash, backfill: false, events: [goldenSwap(nowIso)] },
  });
  expect(ingested.status()).toBe(200);
  const result = (await ingested.json()) as EventsResult;
  expect(result.accepted + result.duplicates).toBe(1);
  expect(result.rejected).toEqual([]);
}

async function fetchGoldenSwapPublicId(request: APIRequestContext): Promise<string> {
  let publicId = "";
  await expect(async () => {
    const feed = await request.get("/api/activity");
    expect(feed.status()).toBe(200);
    const body = (await feed.json()) as { items: { publicId: string; protocol: string }[] };
    const row = body.items.find((item) => item.protocol === "kyberswap");
    expect(row).toBeDefined();
    publicId = row?.publicId ?? "";
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  return publicId;
}

test("dashboard feed shows the verified golden swap", async ({ page, request }) => {
  await seedGoldenSwap(request);
  await expect(async () => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "ETH → VEX" })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  const feedRow = page.locator("tbody tr").filter({ hasText: "kyberswap" });
  await expect(feedRow).toContainText("ETH → VEX");
  await expect(feedRow).toContainText(/1\s*ETH/);
  await expect(feedRow).toContainText("$3,312.44");
  await expect(feedRow).toContainText("confirmed");
  await expect(feedRow).toContainText("robinhood");
});

test("tx detail page renders amounts and og meta", async ({ page, request }) => {
  await seedGoldenSwap(request);
  const publicId = await fetchGoldenSwapPublicId(request);

  await page.goto(`/tx/${publicId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ETH→VEX");
  const inLeg = page.locator("tbody tr").filter({ hasText: "In" }).first();
  await expect(inLeg).toContainText(/1\s*ETH/);
  await expect(inLeg).toContainText("$3,312.44");
  const outLeg = page.locator("tbody tr").filter({ hasText: "Out" }).first();
  await expect(outLeg).toContainText("$3,305.12");
  await expect(page.locator("body")).toContainText("$3.31 est.");
  await expect(page).toHaveTitle("ETH→VEX via kyberswap — AgentScan");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "ETH→VEX via kyberswap — AgentScan",
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "1 ETH est. · confirmed · robinhood",
  );
});
