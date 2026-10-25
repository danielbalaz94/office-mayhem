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
  await expect(page.locator(".subtitle")).toContainText("Goal:");
  await expect(page.locator("#message")).toContainText("finish every listed objective");
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

test("the fern requests water before watering counts toward the mission", async ({ page }) => {
  await chooseMission(page, 0);
  await page.getByRole("button", { name: "Start mission" }).click();
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#waterProgress")).toContainText("Waiting · 0/1");
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-requesting", "true", { timeout: 7000 });
  await expect(page.locator("#plantRequestStatus")).toContainText("needs water");
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-complete", "true");
  await expect(page.locator("#waterProgress")).toHaveText("1/1");
  await expect(page.locator("#plantRequestStatus")).toContainText("Fern watered");
});

test("mission starts reroll the locally generated office, plants, and weather", async ({ page }) => {
  await page.getByRole("button", { name: "Close mission board" }).click();
  const canvas = page.locator("#game");
  await expect(canvas).toHaveAttribute("aria-label", /Office: .+; (day|night), (clear|cloudy|rain|snow); [2-4] plants and flowers\./);
  await page.evaluate(() => {
    const seeds = [121, 122];
    crypto.getRandomValues = array => {
      array[0] = seeds.shift() ?? 123;
      return array;
    };
  });
  await page.getByRole("button", { name: "Start mission" }).click();
  const firstScene = await canvas.getAttribute("aria-label");
  expect(firstScene).toContain("Maple Corner Office; night, snow; 2 plants and flowers.");
  await page.getByRole("button", { name: "Restart mission" }).click();
  const secondScene = await canvas.getAttribute("aria-label");
  expect(secondScene).toContain("Sunroom Annex; day, snow; 3 plants and flowers.");
  expect(secondScene).not.toBe(firstScene);
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
  await expect(page.locator("#activityProgress")).toHaveText("3/3");
  await expect(page.locator("#activityObjective")).toHaveAttribute("data-complete", "true");
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
  await expect(page.locator("#activityProgress")).toHaveText("3/3");
  await expect(page.locator("#activityObjective")).toHaveAttribute("data-complete", "true");
});

test("fern pest-defense missions present an active pest task", async ({ page }) => {
  await unlockThrough(page, 9);
  await chooseMission(page, 8);
  await page.getByRole("button", { name: "Start mission" }).click();
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#taskCopy")).toContainText("Protect the fern from pests");
  await expect(page.locator("#activityProgress")).toHaveText("0/4");
  for (let attempt = 0; attempt < 35; attempt++) {
    await tapCanvas(page, 691, 365);
    const detail = await page.locator("#activityProgress").textContent();
    if (/^[1-4]\/4$/.test(detail)) break;
    await page.waitForTimeout(80);
  }
  await expect(page.locator("#activityProgress")).not.toHaveText("0/4");
});

test("music control is opt-in and updates its accessible state", async ({ page }) => {
  await chooseMission(page, 0);
  const music = page.getByRole("button", { name: /Music: Off/ });
  await music.click();
  await expect(page.getByRole("button", { name: /Music: On/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Music: On/ }).click();
  await expect(page.getByRole("button", { name: /Music: Off/ })).toHaveAttribute("aria-pressed", "false");
});

test("master volume control applies and remembers the chosen level", async ({ page }) => {
  const volume = page.getByRole("slider", { name: "Sound volume" });
  await volume.evaluate(slider => {
    slider.value = "32";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#volumeValue")).toHaveText("32%");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("office-mayhem-volume"))).toBe("32");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Sound volume" })).toHaveValue("32");
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
  test.setTimeout(45_000);
  await unlockThrough(page, 5);
  await chooseMission(page, 2);
  await page.evaluate(() => {
    let elapsed = performance.now();
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(elapsed += 40), 0);
  });
  await page.getByRole("button", { name: "Start mission" }).click();
  const retry = page.getByRole("button", { name: "Play this mission again" });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  const previous = page.getByRole("button", { name: "Previous mission" });
  const next = page.getByRole("button", { name: "Next mission" });
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  await expect(page.getByRole("button", { name: "Missions" })).toBeEnabled();
  await expect(previous).toContainText("Previous");
  await expect(next).toContainText("Next");
  const previousBounds = await previous.boundingBox();
  const retryBounds = await retry.boundingBox();
  const nextBounds = await next.boundingBox();
  expect(previousBounds.x + previousBounds.width).toBeLessThan(retryBounds.x);
  expect(retryBounds.x + retryBounds.width).toBeLessThan(nextBounds.x);
  expect(previousBounds.height).toBeGreaterThanOrEqual(32);

  await next.click();
  await expect(page.locator("#level")).toHaveText("4/9");
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  await previous.click();
  await expect(page.locator("#level")).toHaveText("3/9");
});

test("selecting another mission clears the previous mission's objective checks", async ({ page }) => {
  test.setTimeout(45_000);
  await unlockThrough(page, 2);
  await chooseMission(page, 0);
  await page.evaluate(() => {
    let elapsed = performance.now();
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(elapsed += 40), 0);
  });
  await page.getByRole("button", { name: "Start mission" }).click();
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-requesting", "true", { timeout: 7000 });
  await tapCanvas(page, 691, 365);
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-complete", "true");
  await expect(page.locator("#message")).toContainText("Shift over", { timeout: 30_000 });
  await page.getByRole("button", { name: "Next mission" }).click();
  await expect(page.locator("#level")).toHaveText("2/9");
  await expect(page.locator("#waterProgress")).toHaveText("Waiting · 0/1");
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-complete", "false");
  await expect(page.locator("#coffeeProgress")).toHaveText(/0\/\d+/);
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
    missionBrowser: document.querySelector("#missionBrowserButton").getBoundingClientRect().toJSON(),
    progress: document.querySelector(".mission-progress").getBoundingClientRect().toJSON()
  }));
  expect(landscape.width).toBeLessThanOrEqual(landscape.viewport);
  expect(landscape.scrollHeight).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.card.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.canvas.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.canvas.width).toBeGreaterThan(400);
  expect(landscape.canvas.height).toBeGreaterThan(220);
  expect(landscape.start.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  expect(landscape.missionBrowser.right).toBeLessThanOrEqual(landscape.viewport + 1);
  expect(landscape.progress.bottom).toBeLessThanOrEqual(landscape.viewportHeight + 1);
  await expect(page.locator(".objective-item")).toHaveCount(3);
});

test("mobile touch can start a shift and water the fern when it requests", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch input is exercised in the mobile browser project.");
  await chooseMission(page, 0);
  const start = await page.getByRole("button", { name: "Start mission" }).boundingBox();
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  await expect(page.locator("#waterObjective")).toHaveAttribute("data-requesting", "true", { timeout: 7000 });
  await page.locator("#game").scrollIntoViewIfNeeded();
  const canvas = await page.locator("#game").boundingBox();
  await page.touchscreen.tap(canvas.x + canvas.width * 691 / 960, canvas.y + canvas.height * 365 / 540);
  await expect(page.locator("#waterProgress")).toHaveText("1/1");
});
