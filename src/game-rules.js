export const MISSION_COUNT = 6;
export const PROGRESS_STORAGE_KEY = "office-mayhem-campaign-v2";
export const UNLOCK_THRESHOLDS = Object.freeze([0, 12, 30, 52, 78, 110]);

const TASKS = Object.freeze(["phone", "reports"]);
const TITLES = Object.freeze([
  ["Fern & Furious", "The Inbox Incident", "Quiet Quitting, Loud Phone"],
  ["The Notification Nation", "Aloe, Is It Me?", "The Spreadsheet Sprint"],
  ["The Meeting That Could Be a Mug", "Desk Jungle Rescue", "Ring Ring, It’s Chaos"],
  ["Quarterly Fern Review", "The Ping Parade", "Operation: Mugshot"],
  ["The Great Office Reset", "A Very Busy Break", "The Final Inbox"],
  ["The Chief Beverage Finale", "The Last Great Desk Escape", "Fernageddon"]
]);

function assertMissionIndex(missionIndex) {
  if (!Number.isInteger(missionIndex) || missionIndex < 0 || missionIndex >= MISSION_COUNT) {
    throw new RangeError(`Mission index must be between 0 and ${MISSION_COUNT - 1}.`);
  }
}

export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMission(missionIndex, careerPoints = 0, seed = missionIndex + 1) {
  assertMissionIndex(missionIndex);
  const random = createSeededRandom(seed);
  const points = Number.isFinite(careerPoints) ? Math.max(0, careerPoints) : 0;
  const difficultyTier = Math.min(2, Math.floor((points + missionIndex * 15) / 45));
  const taskKind = TASKS[Math.floor(random() * TASKS.length)];
  const title = TITLES[missionIndex][Math.floor(random() * TITLES[missionIndex].length)];
  const durationSeconds = 65 + missionIndex * 5 + Math.floor(random() * 5);
  const coffeeGoal = 6 + missionIndex * 2 + Math.floor(random() * 2);
  const taskGoalBase = taskKind === "phone"
    ? 1 + Math.floor(missionIndex / 2)
    : 2 + Math.floor(missionIndex / 3);

  return Object.freeze({
    index: missionIndex,
    title,
    durationSeconds,
    coffeeGoal,
    waterGoal: 1 + Math.floor(missionIndex / 3),
    taskKind,
    taskGoal: taskGoalBase + Math.floor(random() * 2),
    difficultyTier,
    spawnInterval: Math.max(.4, 1.04 - missionIndex * .085 - difficultyTier * .07 - random() * .05),
    maxTargets: 4 + Math.floor(missionIndex / 2) + difficultyTier + (random() < .5 ? 0 : 1),
    speedMultiplier: 1 + missionIndex * .085 + difficultyTier * .12 + random() * .08,
    bonusSpeedMultiplier: 1.38 + missionIndex * .055 + difficultyTier * .08 + random() * .25,
    phoneExpiryPenalty: 3 + difficultyTier
  });
}

export function getUnlockedMissionCount(careerPoints) {
  const points = Math.max(0, Number.isFinite(careerPoints) ? careerPoints : 0);
  let unlocked = 1;
  for (let i = 1; i < UNLOCK_THRESHOLDS.length; i++) {
    if (points < UNLOCK_THRESHOLDS[i]) break;
    unlocked++;
  }
  return unlocked;
}

export function createEmptyProgress() {
  return {
    careerPoints: 0,
    bestScores: Array(MISSION_COUNT).fill(0),
    completedMissions: []
  };
}

export function sanitizeProgress(candidate) {
  const empty = createEmptyProgress();
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return empty;

  const careerPoints = Number.isSafeInteger(candidate.careerPoints) && candidate.careerPoints >= 0
    ? candidate.careerPoints
    : 0;
  const bestScores = Array.isArray(candidate.bestScores)
    ? Array.from({ length: MISSION_COUNT }, (_, index) => {
      const value = candidate.bestScores[index];
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    })
    : empty.bestScores;
  const completedMissions = Array.isArray(candidate.completedMissions)
    ? [...new Set(candidate.completedMissions.filter(index =>
      Number.isInteger(index) && index >= 0 && index < MISSION_COUNT))]
    : [];
  return { careerPoints, bestScores, completedMissions };
}

export function recordMissionResult(progress, missionIndex, score, completed = true) {
  assertMissionIndex(missionIndex);
  if (!Number.isSafeInteger(score) || score < 0) {
    throw new RangeError("Mission score must be a non-negative safe integer.");
  }
  const current = sanitizeProgress(progress);
  const bestScores = [...current.bestScores];
  bestScores[missionIndex] = Math.max(bestScores[missionIndex], score);
  const completedMissions = !completed || current.completedMissions.includes(missionIndex)
    ? current.completedMissions
    : [...current.completedMissions, missionIndex];
  return {
    careerPoints: current.careerPoints + score,
    bestScores,
    completedMissions
  };
}

export function applyTargetHit(kind, golden = false) {
  switch (kind) {
    case "hot":
      return { points: golden ? 3 : 1, timeDelta: 0, incidents: 0, progress: "coffee" };
    case "cold":
      return { points: 0, timeDelta: -2, incidents: 1, progress: null };
    case "report":
      return { points: 2, timeDelta: 1.5, incidents: 0, progress: "reports" };
    case "phone":
      return { points: 3, timeDelta: 1, incidents: 0, progress: "phone" };
    default:
      throw new RangeError(`Unknown target kind: ${kind}`);
  }
}

export function applyTargetExpiry(kind, mission) {
  if (kind === "phone") {
    return { timeDelta: -mission.phoneExpiryPenalty, incidents: 1 };
  }
  return { timeDelta: 0, incidents: kind === "hot" ? 1 : 0 };
}

export function isMissionComplete(mission, progress) {
  return progress.coffee >= mission.coffeeGoal &&
    progress.water >= mission.waterGoal &&
    progress[mission.taskKind] >= mission.taskGoal;
}

export function clampMissionTime(currentTime, timeDelta, duration) {
  return Math.min(duration, Math.max(0, currentTime + timeDelta));
}

export function getMissionEndState(missionIndex, completed) {
  if (!completed) return "failed";
  return missionIndex === MISSION_COUNT - 1 ? "campaignComplete" : "missionComplete";
}
