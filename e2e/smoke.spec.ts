import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const agentHash = "c0dec0de".repeat(8);
const ingestToken = `smoke_${"A".repeat(37)}`;
const goldenSwapLinkName = "kyberswap ETH → VEX";
const goldenTokenSymbol = "ETH";
const goldenTokenChainSlug = "robinhood";
const goldenTokenAddress = "0xabc";
const goldenTokenLinkName = `${goldenTokenSymbol} on ${goldenTokenChainSlug}`;
const goldenTokenPath = `/tokens/${goldenTokenChainSlug}/${goldenTokenAddress}`;

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

async function fetchActivityPage(
  request: APIRequestContext,
  query: URLSearchParams = new URLSearchParams(),
): Promise<ActivityPage> {
  const search = query.toString();
  const response = await request.get(search === "" ? "/api/activity" : `/api/activity?${search}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ActivityPage;
}

function swapFilterQuery(): URLSearchParams {
  return new URLSearchParams({ kind: "swap", protocol: "kyberswap" });
}

const swapFilterPath = `/activity?${swapFilterQuery().toString()}`;

function goldenSwapLink(page: Page): Locator {
  return page.getByRole("link", { name: goldenSwapLinkName, exact: true });
}

function goldenSwapRow(page: Page): Locator {
  return page
    .locator("tbody tr")
    .filter({ has: goldenSwapLink(page) })
    .filter({ has: page.getByRole("img", { name: "kyberswap" }) });
}

function goldenTokenLink(page: Page): Locator {
  return page.getByRole("link", { name: goldenTokenLinkName, exact: true });
}

function navbarLink(page: Page, name: string): Locator {
  return page.getByRole("banner").getByRole("link", { name, exact: true });
}

function rankingsTrigger(page: Page): Locator {
  return page.getByRole("banner").getByRole("button", { name: "Rankings" });
}

async function openRankingsMenu(page: Page): Promise<void> {
  await rankingsTrigger(page).click();
  await expect(rankingsTrigger(page)).toHaveAttribute("aria-expanded", "true");
}

async function feedRowHrefs(page: Page): Promise<string[]> {
  return page
    .locator('tbody a[href^="/tx/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
}

async function openPageShowing(page: Page, path: string, expected: Locator): Promise<void> {
  await expect(async () => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(expected).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
}

async function openFeedShowingGoldenSwap(page: Page, path: string): Promise<void> {
  await openPageShowing(page, path, goldenSwapLink(page));
}

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: process.env.SMOKE_BASE_URL ?? "http://localhost",
  });
  await seedGoldenSwap(request);
  await request.dispose();
});

test("dashboard feed shows the verified golden swap", async ({ page, request }) => {
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
  await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/activity");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(goldenSwapRow(page)).toContainText("$3,312.44");
});

test("the activity page appends the next page of rows on demand", async ({ page, request }) => {
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

  const nextPage = await fetchActivityPage(
    request,
    new URLSearchParams({ cursor: feedPage.nextCursor }),
  );
  await loadMore.click();
  await expect(rows).toHaveCount(feedPage.items.length + nextPage.items.length);
});

test("the navbar reaches the tokens and networks pages", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  await navbarLink(page, "Tokens").click();

  await expect(page).toHaveURL("/tokens");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tokens");

  await navbarLink(page, "Networks").click();

  await expect(page).toHaveURL("/networks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Networks");
});

test("the rankings menu reaches every ranking page", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  await openRankingsMenu(page);
  await navbarLink(page, "Agents").click();

  await expect(page).toHaveURL("/agents");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Top agents");

  await openRankingsMenu(page);
  await navbarLink(page, "Protocols").click();

  await expect(page).toHaveURL("/protocols");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Protocols");

  await openRankingsMenu(page);
  await navbarLink(page, "Verification").click();

  await expect(page).toHaveURL("/verification");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verification");
});

test("the rankings menu opens with the keyboard and closes with Escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const trigger = rankingsTrigger(page);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await expect(async () => {
    await trigger.press("ArrowDown");
    await expect(navbarLink(page, "Agents")).toBeFocused({ timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [1_000] });

  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(navbarLink(page, "Agents")).toHaveCount(0);
});

test("the navbar marks the tokens section on the list and on a token page", async ({
  page,
  request,
}) => {
  await fetchGoldenSwapPublicId(request);
  await openPageShowing(page, "/tokens", goldenTokenLink(page));

  await expect(navbarLink(page, "Tokens")).toHaveClass(/topbar-nav-link-active/);
  await expect(navbarLink(page, "Networks")).not.toHaveClass(/topbar-nav-link-active/);

  await page.goto(goldenTokenPath, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(goldenTokenSymbol);
  await expect(navbarLink(page, "Tokens")).toHaveClass(/topbar-nav-link-active/);
  await expect(navbarLink(page, "Networks")).not.toHaveClass(/topbar-nav-link-active/);
});

test("a token row opens the token page for that symbol on that chain", async ({ page, request }) => {
  await fetchGoldenSwapPublicId(request);
  await openPageShowing(page, "/tokens", goldenTokenLink(page));

  const tokenRow = page.locator("tbody tr").filter({ has: goldenTokenLink(page) });
  await tokenRow.locator("td").last().click({ force: true });

  await expect(page).toHaveURL(goldenTokenPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(goldenTokenSymbol);
  await expect(page.locator("main header")).toContainText(goldenTokenChainSlug);
  await expect(page).toHaveTitle(`${goldenTokenSymbol} on ${goldenTokenChainSlug} — AgentScan`);
});

test("two activity filters land in the url and survive a reload", async ({ page, request }) => {
  await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/activity");

  await page.getByLabel("Kind").selectOption("swap");
  await expect(page).toHaveURL("/activity?kind=swap");
  await expect(page.getByText("1 filter active")).toBeVisible();

  await page.getByLabel("Protocol").selectOption("kyberswap");
  await expect(page).toHaveURL(swapFilterPath);
  await expect(page.getByText("2 filters active")).toBeVisible();
  await expect(goldenSwapLink(page)).toBeVisible();
  const filteredHrefs = await feedRowHrefs(page);

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByLabel("Kind")).toHaveValue("swap");
  await expect(page.getByLabel("Protocol")).toHaveValue("kyberswap");
  await expect(goldenSwapLink(page)).toBeVisible();
  expect(await feedRowHrefs(page)).toEqual(filteredHrefs);
});

test("clearing the filters restores the unfiltered feed", async ({ page, request }) => {
  await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/activity");
  const unfilteredHrefs = await feedRowHrefs(page);

  await page.getByLabel("Kind").selectOption("swap");
  await expect(page).toHaveURL("/activity?kind=swap");
  await expect(page.getByText("1 filter active")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expect(page).toHaveURL("/activity");
  await expect(page.getByText("1 filter active")).toHaveCount(0);
  await expect(page.getByLabel("Kind")).toHaveValue("");
  await expect(goldenSwapLink(page)).toBeVisible();
  expect(await feedRowHrefs(page)).toEqual(unfilteredHrefs);
});

test("a filter the swap does not match drops it from the feed", async ({ page, request }) => {
  await fetchGoldenSwapPublicId(request);
  await openFeedShowingGoldenSwap(page, "/activity");

  await page.getByLabel("Kind").selectOption("bridge");

  await expect(page).toHaveURL("/activity?kind=bridge");
  await expect(page.getByText("1 filter active")).toBeVisible();
  await expect(goldenSwapLink(page)).toHaveCount(0);
});

test("load more asks for the next page with the active filters", async ({ page, request }) => {
  await fetchGoldenSwapPublicId(request);
  const rows = page.locator("tbody tr");
  const loadMore = page.getByRole("button", { name: "Load more" });

  let filteredPage: ActivityPage = { items: [], nextCursor: null };
  await expect(async () => {
    filteredPage = await fetchActivityPage(request, swapFilterQuery());
    await page.goto(swapFilterPath, { waitUntil: "load" });
    await expect(rows).toHaveCount(filteredPage.items.length, { timeout: 2_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });

  if (filteredPage.nextCursor === null) {
    await expect(loadMore).toHaveCount(0);
    await expect(goldenSwapLink(page)).toBeVisible();
    return;
  }

  const nextQuery = swapFilterQuery();
  nextQuery.set("cursor", filteredPage.nextCursor);
  const nextPage = await fetchActivityPage(request, nextQuery);
  const nextRequest = page.waitForRequest(
    (candidate) => candidate.url().includes("/api/activity?"),
    { timeout: 15_000 },
  );
  await loadMore.click();
  const requested = new URL((await nextRequest).url());

  expect(requested.searchParams.get("kind")).toBe("swap");
  expect(requested.searchParams.get("protocol")).toBe("kyberswap");
  await expect(rows).toHaveCount(filteredPage.items.length + nextPage.items.length);
});

test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the drifting ambient layers are not animated", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const shimmer = page.locator(".ambient-shimmer");
    const horizon = page.locator(".ambient-horizon");
    const aurora = page.locator(".ambient-aurora");
    await expect(shimmer).toHaveCount(1);
    await expect(horizon).toHaveCount(1);
    await expect(aurora).toHaveCount(3);

    const animationNames = await page.evaluate(() =>
      [...document.querySelectorAll(".ambient-shimmer, .ambient-horizon, .ambient-aurora")].map(
        (node) => getComputedStyle(node).animationName,
      ),
    );

    expect(animationNames).toEqual(["none", "none", "none", "none", "none"]);
  });
});
