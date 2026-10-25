import { test, expect } from "@playwright/test";

const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  pageErrors.set(page, errors);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function chooseMission(page, index) {
  const card = page.locator(".mission-card").nth(index);
  await expect(card).toBeEnabled();
  await card.click();
}

async function tapCanvas(page, x, y) {
  const canvas = page.locator("#game");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width * x / 960, bounds.y + bounds.height * y / 540);
}

async function unlockThrough(page, lastMissionIndex) {
  await page.addInitScript(index => {
    localStorage.setItem("office-mayhem-campaign-v2", JSON.stringify({
      careerPoints: 110,
      bestScores: [1, 2, 3, 4, 5, 6],
      completedMissions: Array.from({ length: index }, (_, mission) => mission)
    }));
  }, lastMissionIndex);
  await page.reload();
}

test("mission board shows nine square cards and the preview matches the selected mission", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Mission board" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".mission-card")).toHaveCount(9);
  await expect(page.locator(".mission-card:not(:disabled)")).toHaveCount(1);
  await expect(page.locator(".mission-card").nth(1)).toBeDisabled();
  const cardBounds = await page.locator(".mission-card").first().boundingBox();
  expect(Math.abs(cardBounds.width - cardBounds.height)).toBeLessThanOrEqual(1);
  const cardContents = await page.locator(".mission-card").evaluateAll(cards =>
    cards.map(card => ({ height: card.clientHeight, scrollHeight: card.scrollHeight })));
  for (const content of cardContents) {
    expect(content.scrollHeight).toBeLessThanOrEqual(content.height + 1);
  }

  const missionTitle = await page.locator(".mission-card").nth(0).locator(".mission-card-title").textContent();
  const taskPreview = await page.locator(".mission-card").nth(0).locator(".mission-card-task").textContent();
  await chooseMission(page, 0);
  await expect(dialog).toBeHidden();
  await expect(page.locator("#missionTitle")).toContainText(missionTitle);
  await expect(page.locator("#taskCopy")).toHaveText(taskPreview);
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.locator("#missionTitle")).toContainText(missionTitle);
  await expect(page.locator("#taskCopy")).toHaveText(taskPreview);
});

test("plant watering requires tapping the fern on the game canvas", async ({ page }) => {
  await chooseMission(page, 0);
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.locator("#water")).toHaveCount(0);
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#taskDetail")).toContainText("Tap the fern (1/1)");
});

test("legacy campaign progress migrates and unlocks the next mission by completion", async ({ page }) => {
  await unlockThrough(page, 6);
  await expect(page.locator(".mission-card:not(:disabled)")).toHaveCount(7);
  await expect(page.locator(".mission-card").nth(0)).toContainText("Best 1");
  await expect(page.locator(".mission-card").nth(5)).toContainText("Complete");
  await expect(page.locator(".mission-card").nth(7)).toBeDisabled();
  const migratedScores = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("office-mayhem-campaign-v3")).bestScores.slice(0, 6));
  expect(migratedScores).toEqual([1, 2, 3, 4, 5, 6]);
});

test("printer repair requires tapping its indicated parts in sequence", async ({ page }) => {
  await unlockThrough(page, 7);
  await chooseMission(page, 6);
  await page.getByRole("button", { name: "Start mission" }).click();
  await tapCanvas(page, 691, 365);
  for (const [x, y] of [[790, 259], [835, 259], [880, 259]]) await tapCanvas(page, x, y);
  await expect(page.locator("#taskDetail")).toContainText("Unjam the printer in order (3/3)");
});

test("paper sorting requires picking up each document and matching its tray", async ({ page }) => {
  await unlockThrough(page, 8);
  await chooseMission(page, 7);
  await page.getByRole("button", { name: "Start mission" }).click();
  await tapCanvas(page, 691, 365);
  const trayX = { red: 390, blue: 480, gold: 570 };
  for (let item = 0; item < 3; item++) {
    const hint = await page.locator("#taskDetail").textContent();
    const color = hint.match(/Next tray: (red|blue|gold)/)?.[1];
    expect(color).toBeTruthy();
    await tapCanvas(page, 480, 377);
    await tapCanvas(page, trayX[color], 465);
  }
  await expect(page.locator("#taskDetail")).toContainText("Sort documents into matching trays (3/3)");
});

test("fern pest-defense missions present an active pest task", async ({ page }) => {
  await unlockThrough(page, 9);
  await chooseMission(page, 8);
  await page.getByRole("button", { name: "Start mission" }).click();
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#taskCopy")).toContainText("Protect the fern from pests");
  await expect(page.locator("#taskDetail")).toContainText("Protect the fern from pests (0/4)");
  for (let attempt = 0; attempt < 35; attempt++) {
    await tapCanvas(page, 691, 365);
    const detail = await page.locator("#taskDetail").textContent();
    if (/Protect the fern from pests \([1-4]\/4\)/.test(detail)) break;
    await page.waitForTimeout(80);
  }
  await expect(page.locator("#taskDetail")).not.toContainText("Protect the fern from pests (0/4)");
});

test("ambient music control is opt-in and updates its accessible state", async ({ page }) => {
  await chooseMission(page, 0);
  const music = page.getByRole("button", { name: /Ambient: Off/ });
  await music.click();
  await expect(page.getByRole("button", { name: /Ambient: On/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Ambient: On/ }).click();
  await expect(page.getByRole("button", { name: /Ambient: Off/ })).toHaveAttribute("aria-pressed", "false");
});

test("result controls stay available beside retry and mission browsing", async ({ page }) => {
  await chooseMission(page, 0);
  await expect(page.locator("#previousMission")).toBeHidden();
  await expect(page.locator("#nextMission")).toBeHidden();
  await expect(page.getByRole("button", { name: "Missions" })).toBeVisible();
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.getByRole("button", { name: "Restart mission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Missions" })).toBeDisabled();
});

test("ended shifts show previous and next controls beside retry", async ({ page }) => {
  await unlockThrough(page, 5);
  await chooseMission(page, 2);
  await page.evaluate(() => {
    let elapsed = performance.now();
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(elapsed += 40), 0);
  });
  await page.getByRole("button", { name: "Start mission" }).click();
  const retry = page.getByRole("button", { name: "Play this mission again" });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  const previous = page.getByRole("button", { name: "Previous mission" });
  const next = page.getByRole("button", { name: "Next mission" });
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await expect(page.getByRole("button", { name: "Missions" })).toBeEnabled();

  await next.click();
  await expect(page.locator("#level")).toHaveText("4/9");
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  await previous.click();
  await expect(page.locator("#level")).toHaveText("3/9");
});

test("portrait and rotated landscape keep the canvas and controls within the viewport", async ({ page }) => {
  await chooseMission(page, 0);
  await page.getByRole("button", { name: "Start mission" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const portrait = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    canvas: document.querySelector("#game").getBoundingClientRect().toJSON(),
    start: document.querySelector("#start").getBoundingClientRect().toJSON()
  }));
  expect(portrait.width).toBeLessThanOrEqual(portrait.viewport);
  expect(portrait.canvas.width).toBeGreaterThan(250);
  expect(portrait.start.right).toBeLessThanOrEqual(portrait.viewport + 1);

  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    card: document.querySelector(".game-card").getBoundingClientRect().toJSON(),
    canvas: document.querySelector("#game").getBoundingClientRect().toJSON(),
    start: document.querySelector("#start").getBoundingClientRect().toJSON(),
    missionBrowser: document.querySelector("#missionBrowserButton").getBoundingClientRect().toJSON()
  }));
  expect(landscape.width).toBeLessThanOrEqual(landscape.viewport);
  expect(landscape.scrollHeight).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.card.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.canvas.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.start.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.missionBrowser.right).toBeLessThanOrEqual(landscape.viewport + 1);
});

test("mobile touch can start a shift and water the plant directly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch input is exercised in the mobile browser project.");
  await chooseMission(page, 0);
  const start = await page.getByRole("button", { name: "Start mission" }).boundingBox();
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  await page.locator("#game").scrollIntoViewIfNeeded();
  const canvas = await page.locator("#game").boundingBox();
  await page.touchscreen.tap(canvas.x + canvas.width * 691 / 960, canvas.y + canvas.height * 365 / 540);
  await expect(page.locator("#taskDetail")).toContainText("Tap the fern (1/1)");
});
