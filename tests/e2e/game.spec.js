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

test("shows six selectable missions and starts with accessible plant watering", async ({ page }) => {
  await expect(page.getByText("YELLOW REPORT = BONUS")).toBeVisible();
  const select = page.getByLabel("Choose an unlocked mission");
  await expect(select.locator("option")).toHaveCount(6);
  await expect(select.locator("option:disabled")).toHaveCount(5);
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(select).toBeDisabled();
  const water = page.getByRole("button", { name: /Water fern/ });
  await expect(water).toBeVisible();
  await water.click();
  await expect(water).toBeHidden();
  await expect(page.locator("#taskDetail")).toContainText("Water the fern (1/1)");
});

test("mission selection respects earned career points", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("office-mayhem-campaign-v2", JSON.stringify({
      careerPoints: 110,
      bestScores: [0, 0, 0, 0, 0, 0],
      completedMissions: []
    }));
  });
  await page.reload();
  const select = page.getByLabel("Choose an unlocked mission");
  await expect(select.locator("option:disabled")).toHaveCount(0);
  await select.selectOption("5");
  await expect(page.locator("#missionTitle")).toContainText("Mission 6");
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.getByLabel("Choose an unlocked mission")).toBeDisabled();
  await expect(page.locator("#level")).toHaveText("6/6");
  const hint = await page.locator("#missionHint").textContent();
  const taskDetail = await page.locator("#taskDetail").textContent();
  if (hint.includes("phone triage")) {
    expect(taskDetail).toContain("Silence ringing phones");
  } else {
    expect(hint).toContain("report filing");
    expect(taskDetail).toContain("File yellow reports");
  }
});

test("ambient music control is opt-in and updates its accessible state", async ({ page }) => {
  const music = page.getByRole("button", { name: /Ambient: Off/ });
  await music.click();
  await expect(page.getByRole("button", { name: /Ambient: On/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Ambient: On/ }).click();
  await expect(page.getByRole("button", { name: /Ambient: Off/ })).toHaveAttribute("aria-pressed", "false");
});

test("portrait and rotated landscape keep the canvas and controls within the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.getByRole("button", { name: /Water fern/ })).toBeVisible();
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
    water: document.querySelector("#water").getBoundingClientRect().toJSON()
  }));
  expect(landscape.width).toBeLessThanOrEqual(landscape.viewport);
  expect(landscape.scrollHeight).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.card.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.canvas.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.start.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.water.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
});

test("mobile touch can start a shift and water the fern", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch input is exercised in the mobile browser project.");
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const start = await page.getByRole("button", { name: "Start mission" }).boundingBox();
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  const water = page.getByRole("button", { name: /Water fern/ });
  await expect(water).toBeVisible();
  const box = await water.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(water).toBeHidden();
  await expect(page.locator("#taskDetail")).toContainText("Water the fern (1/1)");
});
