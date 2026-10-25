import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSION_COUNT,
  TASKS,
  applyPlantRequestExpiry,
  applyTargetExpiry,
  applyTargetHit,
  clampMissionTime,
  chooseTargetKind,
  createEmptyProgress,
  createMission,
  createOfficeScene,
  getAdjacentMissionIndex,
  getMissionBadges,
  getMissionEndState,
  getTargetSpeed,
  getUnlockedMissionIndices,
  isMissionComplete,
  migrateLegacyProgress,
  recordMissionResult,
  sanitizeProgress
} from "../src/game-rules.js";

test("procedural missions are deterministic for the same result and seed", () => {
  assert.deepEqual(createMission(2, 40, 1234), createMission(2, 40, 1234));
  const variants = new Set(Array.from({ length: 20 }, (_, seed) =>
    JSON.stringify(createMission(2, 40, seed + 1))));
  assert.ok(variants.size > 1);
  assert.ok(new Set([...variants].map(value => JSON.parse(value).durationSeconds)).size > 1);
});

test("procedural office scenes vary locally with distinct layouts, weather, and plants", () => {
  const first = createOfficeScene(121);
  assert.deepEqual(createOfficeScene(121), first);
  assert.notDeepEqual(createOfficeScene(122), first);
  const scenes = Array.from({ length: 80 }, (_, seed) => createOfficeScene(seed + 1));

  assert.ok(new Set(scenes.map(scene => scene.office.name)).size > 1);
  assert.ok(new Set(scenes.map(scene => scene.timeOfDay)).has("day"));
  assert.ok(new Set(scenes.map(scene => scene.timeOfDay)).has("night"));
  assert.ok(new Set(scenes.map(scene => scene.weather)).has("rain"));
  assert.ok(new Set(scenes.map(scene => scene.weather)).has("snow"));
  for (const scene of scenes) {
    assert.ok(["clear", "cloudy", "rain", "snow"].includes(scene.weather));
    assert.ok(scene.plants.length >= 2 && scene.plants.length <= 4);
    assert.ok(scene.plants.some(plant => plant.kind === "fern"));
    assert.ok(scene.plants.some(plant => ["daisy", "tulip", "sunflower"].includes(plant.kind)));
    assert.equal(new Set(scene.plants.map(plant => plant.x)).size, scene.plants.length);
    assert.ok(scene.plants.every(plant => plant.y === 366 && typeof plant.pot === "string"));
  }
});

test("nine fixed missions progressively introduce distinct activity types", () => {
  assert.equal(MISSION_COUNT, 9);
  assert.deepEqual(TASKS, ["phone", "reports", "phone", "reports", "phone", "reports", "printer", "sorting", "pests"]);
  assert.ok(createMission(8, 0, 9).sortingSequence.length === 0);
  assert.equal(createMission(7, 0, 9).sortingSequence.length, 3);
  assert.equal(createMission(6, 0, 9).taskGoal, 3);
  assert.equal(createMission(8, 0, 9).taskGoal, 4);
});

test("later missions are measurably faster and more demanding than early missions", () => {
  const easy = createMission(0, 0, 9);
  const hard = createMission(8, 0, 9);
  assert.ok(hard.durationSeconds > easy.durationSeconds);
  assert.ok(hard.coffeeGoal > easy.coffeeGoal);
  assert.ok(hard.speedMultiplier > easy.speedMultiplier);
  assert.ok(hard.spawnInterval < easy.spawnInterval);
  assert.ok(hard.bonusSpeedMultiplier > hard.speedMultiplier);
  for (const kind of ["hot", "phone", "report"]) {
    assert.ok(getTargetSpeed(100, hard, kind) > getTargetSpeed(100, easy, kind));
  }
  assert.ok(getTargetSpeed(100, easy, "cold") > getTargetSpeed(100, easy, "hot"));
  assert.ok(getTargetSpeed(100, easy, "hot", true) > getTargetSpeed(100, easy, "hot"));
  assert.throws(() => getTargetSpeed(100, easy, "bug"), RangeError);
});

test("stronger career results can increase target difficulty without unlocking missions", () => {
  const early = createMission(2, 0, 8);
  const successful = createMission(2, 100, 8);
  assert.ok(successful.difficultyTier > early.difficultyTier);
  assert.ok(successful.speedMultiplier > early.speedMultiplier);
  assert.ok(successful.spawnInterval < early.spawnInterval);
  assert.deepEqual(getUnlockedMissionIndices({ careerPoints: 999 }), [0]);
});

test("invalid mission indices are rejected", () => {
  assert.throws(() => createMission(-1), RangeError);
  assert.throws(() => createMission(MISSION_COUNT), RangeError);
  assert.throws(() => getMissionBadges(MISSION_COUNT, true, 0), RangeError);
});

test("completing a mission unlocks the next; failed runs and scores do not", () => {
  const initial = createEmptyProgress();
  assert.deepEqual(getUnlockedMissionIndices(initial), [0]);
  const failed = recordMissionResult(initial, 0, 500, false, 1);
  assert.deepEqual(getUnlockedMissionIndices(failed), [0]);
  const complete = recordMissionResult(failed, 0, 3, true, 0);
  assert.deepEqual(getUnlockedMissionIndices(complete), [0, 1]);
  assert.deepEqual(complete.perfectMissions, [0]);
  assert.ok(complete.earnedBadges.includes("incident-free-0"));
});

test("previous and next mission navigation selects the closest unlocked mission", () => {
  const progress = { completedMissions: [0, 1, 2], legacyUnlockedMissions: [] };
  assert.equal(getAdjacentMissionIndex(2, -1, progress), 1);
  assert.equal(getAdjacentMissionIndex(2, 1, progress), 3);
  assert.equal(getAdjacentMissionIndex(0, -1, progress), undefined);
  assert.equal(getAdjacentMissionIndex(8, 1, progress), undefined);
  assert.throws(() => getAdjacentMissionIndex(2, 0, progress), RangeError);
});

test("mission results retain best scores and completion badges without score-gated unlocks", () => {
  const first = recordMissionResult(createEmptyProgress(), 0, 15, true, 2);
  const replay = recordMissionResult(first, 0, 4, true, 0);
  assert.equal(replay.careerPoints, 19);
  assert.equal(replay.bestScores[0], 15);
  assert.deepEqual(replay.completedMissions, [0]);
  assert.deepEqual(replay.perfectMissions, [0]);
  assert.deepEqual(replay.earnedBadges, ["mission-0-complete", "incident-free-0"]);
  assert.deepEqual(getUnlockedMissionIndices(replay), [0, 1]);
  assert.throws(() => recordMissionResult(first, 1, -2), RangeError);
});

test("legacy score unlocks and six-mission saves migrate without losing progress", () => {
  const migrated = migrateLegacyProgress({
    careerPoints: 110,
    bestScores: [4, 5, 6, 7, 8, 9],
    completedMissions: [0, 2, 5]
  });
  assert.deepEqual(migrated.bestScores.slice(0, 6), [4, 5, 6, 7, 8, 9]);
  assert.equal(migrated.bestScores.length, 9);
  assert.deepEqual(migrated.completedMissions, [0, 2, 5]);
  assert.deepEqual(getUnlockedMissionIndices(migrated), [0, 1, 2, 3, 4, 5, 6]);
});

test("saved campaign data is sanitized before use", () => {
  assert.deepEqual(
    sanitizeProgress({ careerPoints: 17, bestScores: [4, -1], completedMissions: [1, 1, 99, "2"], perfectMissions: [1, -1], earnedBadges: ["ok", 2] }),
    {
      careerPoints: 17,
      bestScores: [4, 0, 0, 0, 0, 0, 0, 0, 0],
      completedMissions: [1],
      perfectMissions: [1],
      earnedBadges: ["ok"],
      legacyUnlockedMissions: []
    }
  );
  assert.deepEqual(sanitizeProgress(null), createEmptyProgress());
});

test("coffee, report, phone, pest, and iced targets have distinct tested rewards", () => {
  assert.deepEqual(applyTargetHit("hot"), { points: 1, timeDelta: 0, incidents: 0, progress: "coffee" });
  assert.equal(applyTargetHit("hot", true).points, 3);
  assert.equal(applyTargetHit("cold").timeDelta, -2);
  assert.equal(applyTargetHit("report").progress, "reports");
  assert.equal(applyTargetHit("phone").progress, "phone");
  assert.equal(applyTargetHit("bug").progress, "pests");
  assert.throws(() => applyTargetHit("mystery"), RangeError);
});

test("ignoring phones and pests incurs penalties while harder missions penalize more", () => {
  const easy = createMission(0, 0, 1);
  const hard = createMission(4, 120, 1);
  assert.equal(applyTargetExpiry("phone", easy).timeDelta, -easy.phoneExpiryPenalty);
  assert.ok(applyTargetExpiry("phone", hard).timeDelta < applyTargetExpiry("phone", easy).timeDelta);
  assert.deepEqual(applyTargetExpiry("bug", easy), { timeDelta: -2, incidents: 1 });
  assert.equal(applyTargetExpiry("hot", easy).incidents, 1);
});

test("missed plant requests cost points, time, and an incident", () => {
  assert.deepEqual(applyPlantRequestExpiry(5, 30, 2), { score: 3, timeLeft: 28, incidents: 3 });
  assert.deepEqual(applyPlantRequestExpiry(1, 1, 0), { score: 0, timeLeft: 0, incidents: 1 });
  assert.throws(() => applyPlantRequestExpiry(-1, 1, 0), RangeError);
});

test("a mission requires coffee and its selected activity, not plant watering", () => {
  for (const missionIndex of [0, 6, 7, 8]) {
    const mission = createMission(missionIndex, 20, 77);
    const progress = { coffee: mission.coffeeGoal, [mission.taskKind]: mission.taskGoal };
    assert.equal(isMissionComplete(mission, progress), true);
    assert.equal(isMissionComplete(mission, { ...progress, [mission.taskKind]: mission.taskGoal - 1 }), false);
  }
});

test("mission time rewards never exceed the duration or fall below zero", () => {
  assert.equal(clampMissionTime(64, 5, 65), 65);
  assert.equal(clampMissionTime(1, -3, 65), 0);
  assert.equal(clampMissionTime(20, 4, 65), 24);
});

test("hot coffee is guaranteed after at most two non-hot spawn selections", () => {
  const sequence = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9];
  let nonHotStreak = 0;
  const selected = sequence.map(roll => {
    const kind = chooseTargetKind(roll, "phone", true, nonHotStreak);
    nonHotStreak = kind === "hot" ? 0 : nonHotStreak + 1;
    return kind;
  });
  assert.ok(selected.some(kind => kind === "phone"));
  assert.ok(selected.some(kind => kind === "cold"));
  assert.ok(selected.some(kind => kind === "hot"));
  for (let index = 2; index < selected.length; index++) {
    assert.notEqual(selected.slice(index - 2, index + 1).every(kind => kind !== "hot"), true);
  }
  assert.equal(chooseTargetKind(0, "phone", true, 2), "hot");
  assert.throws(() => chooseTargetKind(1, "phone", true), RangeError);
  assert.throws(() => chooseTargetKind(.5, "phone", true, -1), RangeError);
});

test("iced mugs appear regularly and report mugs never spawn while one is active", () => {
  const counts = { cold: 0, report: 0, phone: 0, hot: 0 };
  for (let step = 0; step < 1000; step++) {
    const kind = chooseTargetKind(step / 1000, null, false);
    counts[kind]++;
  }
  assert.ok(counts.cold >= 300);
  assert.ok(counts.report >= 100);
  assert.equal(chooseTargetKind(.3, "reports", true, 0, 1), "cold");
  assert.equal(chooseTargetKind(.1, "reports", true, 0, 0), "report");
  assert.equal(chooseTargetKind(.8, null, false, 0, 0, 3), "cold");
  assert.equal(chooseTargetKind(.8, null, false, 2, 3), "hot");
  assert.throws(() => chooseTargetKind(.5, "phone", true, 0, -1), RangeError);
});

test("commendations distinguish mission completion, incident-free shifts, and campaign finale", () => {
  assert.deepEqual(getMissionBadges(0, false, 0), []);
  assert.deepEqual(getMissionBadges(0, true, 1), ["mission-0-complete"]);
  assert.deepEqual(getMissionBadges(0, true, 0), ["mission-0-complete", "incident-free-0"]);
  assert.equal(getMissionBadges(8, true, 0).at(-1), "campaign-complete");
});

test("only a completed ninth mission ends the campaign", () => {
  assert.equal(getMissionEndState(0, true), "missionComplete");
  assert.equal(getMissionEndState(MISSION_COUNT - 1, true), "campaignComplete");
  assert.equal(getMissionEndState(MISSION_COUNT - 1, false), "failed");
});
