import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const agentHash = "c0dec0de".repeat(8);
const ingestToken = `smoke_${"A".repeat(37)}`;
const goldenSwapLinkName = "kyberswap ETH → VEX";

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
    const body = (await feed.json()) as {
      items: { publicId: string; protocol: string; tokenInSymbol: string | null; tokenOutSymbol: string | null }[];
    };
    const row = body.items.find(
      (item) =>
        item.protocol === "kyberswap" && item.tokenInSymbol === "ETH" && item.tokenOutSymbol === "VEX",
    );
    expect(row).toBeDefined();
    publicId = row?.publicId ?? "";
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  return publicId;
}

type ActivityPage = { items: { publicId: string }[]; nextCursor: string | null };

async function fetchActivityPage(request: APIRequestContext, cursor?: string): Promise<ActivityPage> {
  const path = cursor === undefined ? "/api/activity" : `/api/activity?cursor=${encodeURIComponent(cursor)}`;
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  return (await response.json()) as ActivityPage;
}

function goldenSwapLink(page: Page): Locator {
  return page.getByRole("link", { name: goldenSwapLinkName, exact: true });
}

function goldenSwapRow(page: Page): Locator {
  return page
    .locator("tbody tr")
    .filter({ has: goldenSwapLink(page) })
    .filter({ has: page.getByRole("img", { name: "kyberswap" }) });
}

async function openFeedShowingGoldenSwap(page: Page, path: string): Promise<void> {
  await expect(async () => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(goldenSwapLink(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
}

test("dashboard feed shows the verified golden swap", async ({ page, request }) => {
  await seedGoldenSwap(request);
  const publicId = await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/");
  const feedRow = goldenSwapRow(page);
  await expect(feedRow.locator("td")).toHaveCount(5);
  await expect(feedRow).toContainText("ETH → VEX");
  await expect(feedRow).toContainText(/1\s*ETH/);
  await expect(feedRow).toContainText("$3,312.44");
  await expect(feedRow).toContainText("robinhood");
  await expect(goldenSwapLink(page)).toHaveAttribute("href", `/tx/${publicId}`);
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

test("a feed row opens the transaction detail when the age column is clicked", async ({
  page,
  request,
}) => {
  await seedGoldenSwap(request);
  const publicId = await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/");

  const ageCell = goldenSwapRow(page).locator("td").last();
  await expect(ageCell).toHaveText(/^\d+[smhd]$/);
  await ageCell.click({ force: true });

  await expect(page).toHaveURL(new RegExp(`/tx/${publicId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ETH→VEX");
});

test("the methodology page is gone", async ({ page }) => {
  const response = await page.goto("/methodology", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
});

test("the theme toggle switches between both themes", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "cobalt");

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "cobalt");
});

test("the chosen theme survives a reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
});

test("a chart range chip loads its range without a page navigation", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const chip = page
    .getByRole("group", { name: "Chart range" })
    .getByRole("button", { name: "24H", exact: true });
  await expect(chip).toHaveAttribute("aria-pressed", "false");

  let documentLoads = 0;
  page.on("load", () => {
    documentLoads += 1;
  });
  const chartRequest = page.waitForRequest(
    (candidate) => candidate.url().includes("/api/chart?range=24h"),
    { timeout: 15_000 },
  );
  await chip.click();
  await chartRequest;

  await expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(documentLoads).toBe(0);
});

test("the activity page lists the verified golden swap", async ({ page, request }) => {
  await seedGoldenSwap(request);
  await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/activity");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(goldenSwapRow(page)).toContainText("$3,312.44");
});

test("the activity page appends the next page of rows on demand", async ({ page, request }) => {
  await seedGoldenSwap(request);
  await fetchGoldenSwapPublicId(request);
  const rows = page.locator("tbody tr");
  const loadMore = page.getByRole("button", { name: "Load more" });

  let feedPage: ActivityPage = { items: [], nextCursor: null };
  await expect(async () => {
    feedPage = await fetchActivityPage(request);
    await page.goto("/activity", { waitUntil: "load" });
    await expect(rows).toHaveCount(feedPage.items.length, { timeout: 2_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });

  if (feedPage.nextCursor === null) {
    await expect(loadMore).toHaveCount(0);
    return;
  }

  const nextPage = await fetchActivityPage(request, feedPage.nextCursor);
  await loadMore.click();
  await expect(rows).toHaveCount(feedPage.items.length + nextPage.items.length);
});

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the ambient beam is not animated", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const beam = page.locator(".ambient-beam");
    await expect(beam).toHaveCount(1);

    const animationName = await beam.evaluate((node) => getComputedStyle(node).animationName);

    expect(animationName).toBe("none");
  });
});
