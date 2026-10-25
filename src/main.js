import { GameAudio } from "./audio.js";
import { REPORT_PALETTE } from "./palette.js";
import {
  MISSION_COUNT,
  PROGRESS_STORAGE_KEY,
  LEGACY_PROGRESS_STORAGE_KEY,
  TASK_LABELS,
  applyTargetExpiry,
  applyTargetHit,
  clampMissionTime,
  chooseTargetKind,
  createEmptyProgress,
  createMission,
  getAdjacentMissionIndex,
  getMissionEndState,
  getTargetSpeed,
  getUnlockedMissionIndices,
  isMissionUnlocked,
  isMissionComplete,
  migrateLegacyProgress,
  recordMissionResult,
  sanitizeProgress
} from "./game-rules.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const nodes = {
  score: document.querySelector("#score"),
  caught: document.querySelector("#caught"),
  time: document.querySelector("#time"),
  incidents: document.querySelector("#incidents"),
  level: document.querySelector("#level"),
  missionTitle: document.querySelector("#missionTitle"),
  taskCopy: document.querySelector("#taskCopy"),
  coffeeObjective: document.querySelector("#coffeeObjective"),
  coffeeStatus: document.querySelector("#coffeeStatus"),
  coffeeProgress: document.querySelector("#coffeeProgress"),
  waterObjective: document.querySelector("#waterObjective"),
  waterStatus: document.querySelector("#waterStatus"),
  waterProgress: document.querySelector("#waterProgress"),
  activityObjective: document.querySelector("#activityObjective"),
  activityStatus: document.querySelector("#activityStatus"),
  activityName: document.querySelector("#activityName"),
  activityProgress: document.querySelector("#activityProgress"),
  taskDetail: document.querySelector("#taskDetail"),
  plantRequestStatus: document.querySelector("#plantRequestStatus"),
  message: document.querySelector("#message"),
  start: document.querySelector("#start"),
  music: document.querySelector("#music"),
  volume: document.querySelector("#volume"),
  volumeValue: document.querySelector("#volumeValue"),
  missionBrowser: document.querySelector("#missionBrowser"),
  missionBrowserButton: document.querySelector("#missionBrowserButton"),
  closeMissionBrowser: document.querySelector("#closeMissionBrowser"),
  missionCards: document.querySelector("#missionCards"),
  previousMission: document.querySelector("#previousMission"),
  nextMission: document.querySelector("#nextMission")
};
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const targets = [];
const particles = [];
const audio = new GameAudio();
const VOLUME_STORAGE_KEY = "office-mayhem-volume";
const missionPreviews = new Map();
const storedVolumeValue = localStorage.getItem(VOLUME_STORAGE_KEY);
const storedVolume = Number(storedVolumeValue);
const initialVolume = storedVolumeValue !== null && Number.isFinite(storedVolume)
  ? Math.max(0, Math.min(100, storedVolume))
  : 65;
nodes.volume.value = String(initialVolume);
nodes.volumeValue.textContent = `${initialVolume}%`;
audio.setVolume(initialVolume / 100);
const initialProgress = loadProgress();
const coffeeQuips = [
  "Caffeine secured. Your hands are union-approved!",
  "Excellent temperature discrimination!",
  "Your manager is pretending not to be impressed.",
  "That coffee had a meeting to get to.",
  "The office fern believes in you."
];
const state = {
  mode: "ready",
  selectedIndex: 0,
  mission: createMission(0, initialProgress.careerPoints, 101),
  progress: initialProgress,
  score: 0,
  incidents: 0,
  timeLeft: 65,
  task: { coffee: 0, water: 0, phone: 0, reports: 0, printer: 0, sorting: 0, pests: 0 },
  spawnClock: 0,
  nonHotSpawnStreak: 0,
  waterRequestClock: 0,
  fernRequesting: false,
  lastFrame: 0,
  messageClock: 0,
  shake: 0,
  fernWetUntil: 0,
  sortingItemSelected: false,
  pestClock: 0
};

function loadProgress() {
  const current = localStorage.getItem(PROGRESS_STORAGE_KEY);
  const stored = current ?? localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY);
  if (!stored) return createEmptyProgress();
  try {
    const parsed = JSON.parse(stored);
    if (current) return sanitizeProgress(parsed);
    const migrated = migrateLegacyProgress(parsed);
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(migrated));
    } catch (error) {
      console.error("Could not save migrated Office Mayhem progress.", error);
    }
    return migrated;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    console.warn("Saved Office Mayhem progress was invalid; starting a clean campaign.", error);
    return createEmptyProgress();
  }
}

function saveProgress(completed) {
  const next = recordMissionResult(state.progress, state.mission.index, state.score, completed, state.incidents);
  state.progress = next;
  let saved = true;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Could not save Office Mayhem campaign progress.", error);
    saved = false;
  }
  updateMissionPicker();
  return saved;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function setMessage(text, seconds = 2.3) {
  nodes.message.textContent = text;
  state.messageClock = seconds;
}

function formatTaskHint() {
  const details = ["Commendation: zero incidents"];
  if (state.fernRequesting) details.push("The fern is asking for water");
  if (state.mission.taskKind === "sorting" && state.task.sorting < state.mission.taskGoal) {
    const tray = ["red", "blue", "gold"][state.mission.sortingSequence[state.task.sorting]];
    if (tray) details.push(`Next tray: ${tray}`);
  }
  return details.join(" · ");
}

function updateObjective(node, statusNode, progressNode, current, goal) {
  const complete = current >= goal;
  node.dataset.complete = String(complete);
  statusNode.textContent = complete ? "✓" : "○";
  progressNode.textContent = `${current}/${goal}`;
}

function updateMissionProgress() {
  const { mission, task } = state;
  const activityCount = task[mission.taskKind] ?? 0;
  nodes.activityName.textContent = TASK_LABELS[mission.taskKind];
  updateObjective(nodes.coffeeObjective, nodes.coffeeStatus, nodes.coffeeProgress, task.coffee, mission.coffeeGoal);
  updateObjective(nodes.waterObjective, nodes.waterStatus, nodes.waterProgress, task.water, mission.waterGoal);
  updateObjective(nodes.activityObjective, nodes.activityStatus, nodes.activityProgress, activityCount, mission.taskGoal);
  nodes.waterObjective.dataset.requesting = String(state.fernRequesting);
  nodes.waterProgress.textContent = task.water >= mission.waterGoal
    ? `${task.water}/${mission.waterGoal}`
    : `${state.fernRequesting ? "Needs water · " : "Waiting · "}${task.water}/${mission.waterGoal}`;
}

function updateMissionPicker() {
  refreshMissionPreviews();
  updateMissionDescription();
  updateMissionCards();
}

function refreshMissionPreviews() {
  missionPreviews.clear();
  for (let index = 0; index < MISSION_COUNT; index++) {
    const mission = index === state.selectedIndex
      ? state.mission
      : createMission(index, state.progress.careerPoints, crypto.getRandomValues(new Uint32Array(1))[0]);
    missionPreviews.set(index, mission);
  }
}

function taskDescription(mission) {
  return `${mission.coffeeGoal} hot coffees · tap fern · ${TASK_LABELS[mission.taskKind]}`;
}

function updateMissionCards() {
  nodes.missionCards.replaceChildren();
  const unlocked = new Set(getUnlockedMissionIndices(state.progress));
  for (let index = 0; index < MISSION_COUNT; index++) {
    const mission = missionPreviews.get(index) ?? createMission(index, state.progress.careerPoints, index + 101);
    const card = document.createElement("button");
    card.className = "mission-card";
    card.type = "button";
    card.disabled = !unlocked.has(index);
    card.setAttribute("aria-current", String(index === state.selectedIndex));
    const number = document.createElement("span");
    number.className = "mission-card-number";
    number.textContent = `Mission ${index + 1}`;
    const title = document.createElement("span");
    title.className = "mission-card-title";
    title.textContent = mission.title;
    const task = document.createElement("span");
    task.className = "mission-card-task";
    task.textContent = taskDescription(mission);
    const metadata = document.createElement("span");
    metadata.className = "mission-card-meta";
    metadata.textContent = unlocked.has(index)
      ? `${mission.durationSeconds}s · Best ${state.progress.bestScores[index]}`
      : `Locked · Complete mission ${index}`;
    card.append(number, title, task, metadata);
    const status = document.createElement("span");
    status.className = "mission-card-status";
    if (state.progress.completedMissions.includes(index)) {
      status.textContent = state.progress.perfectMissions.includes(index) ? "Complete · Zero-incident badge" : "Complete · Replay";
    } else if (!unlocked.has(index)) {
      status.textContent = "Complete the previous mission to unlock";
    } else {
      status.textContent = "Available · Earn a zero-incident badge";
    }
    card.append(status);
    card.addEventListener("click", () => {
      selectMission(index, mission);
      nodes.missionBrowser.close();
      setMessage(`Mission ${index + 1} selected. Zero incidents earns a commendation.`, 3);
    });
    nodes.missionCards.append(card);
  }
}

function updateMissionDescription() {
  nodes.taskCopy.textContent = taskDescription(state.mission);
}

function updateHud() {
  const { mission, task } = state;
  nodes.score.textContent = String(state.score).padStart(2, "0");
  nodes.caught.textContent = `${task.coffee}/${mission.coffeeGoal}`;
  nodes.time.textContent = String(Math.ceil(Math.max(0, state.timeLeft))).padStart(2, "0");
  nodes.time.classList.toggle("time-low", state.mode === "running" && state.timeLeft <= 10);
  nodes.incidents.textContent = String(state.incidents);
  nodes.level.textContent = `${mission.index + 1}/${MISSION_COUNT}`;
  nodes.missionTitle.textContent = `Mission ${mission.index + 1} · ${mission.title}`;
  updateMissionProgress();
  nodes.taskDetail.textContent = formatTaskHint();
  const resultVisible = state.mode === "missionComplete" || state.mode === "campaignComplete" ||
    state.mode === "failed" || state.mode === "browsing";
  const unlocked = getUnlockedMissionIndices(state.progress);
  nodes.previousMission.hidden = !resultVisible;
  nodes.nextMission.hidden = !resultVisible;
  nodes.previousMission.disabled = !unlocked.some(index => index < state.selectedIndex);
  nodes.nextMission.disabled = !unlocked.some(index => index > state.selectedIndex);
  nodes.missionBrowserButton.disabled = state.mode === "running";
}

function selectMission(index, preview = missionPreviews.get(index)) {
  if (!Number.isInteger(index) || !isMissionUnlocked(index, state.progress)) return;
  if (!preview) {
    preview = createMission(index, state.progress.careerPoints, crypto.getRandomValues(new Uint32Array(1))[0]);
    missionPreviews.set(index, preview);
  }
  state.selectedIndex = index;
  state.mission = preview;
  state.mode = "ready";
  nodes.start.textContent = "Start mission";
  updateMissionDescription();
  updateMissionCards();
  updateHud();
}

function startMission() {
  state.score = 0;
  state.incidents = 0;
  state.timeLeft = state.mission.durationSeconds;
  state.task = { coffee: 0, water: 0, phone: 0, reports: 0, printer: 0, sorting: 0, pests: 0 };
  state.spawnClock = 0;
  state.nonHotSpawnStreak = 0;
  state.waterRequestClock = 5;
  state.fernRequesting = false;
  state.pestClock = 0;
  state.sortingItemSelected = false;
  state.fernWetUntil = 0;
  nodes.plantRequestStatus.textContent = "The fern is resting.";
  targets.length = 0;
  particles.length = 0;
  state.mode = "running";
  audio.prepare().catch(error => {
    console.error("Could not initialize game audio.", error);
    setMessage("This browser could not start game audio.", 3);
  });
  nodes.start.textContent = "Restart mission";
  setMessage("Go! The phones are buzzing and the fern has a calendar invite.", 3);
  updateHud();
  canvas.focus({ preventScroll: true });
}

function persistAndFinish(completed) {
  const saved = saveProgress(completed);
  state.mode = getMissionEndState(state.mission.index, completed);
  if (completed) audio.playMissionComplete();
  nodes.start.textContent = state.mode === "campaignComplete" ? "Replay a mission" : "Play this mission again";
  state.timeLeft = Math.max(0, state.timeLeft);
  targets.length = 0;
  updateHud();
  if (state.mode === "campaignComplete") {
    setMessage(`Campaign complete! You are Chief of Everything. The fern gets your office.${saved ? "" : " Progress could not be saved."}`, 99);
  } else if (state.mode === "missionComplete") {
    const earnedBadge = state.progress.perfectMissions.includes(state.mission.index);
    setMessage(`Mission complete! ${earnedBadge ? "Zero-incident commendation earned." : "Try again without incidents for a commendation."}${saved ? "" : " Progress could not be saved."}`, 99);
  } else {
    setMessage(`Shift over. The phone is still ringing, but at least the fern is hydrated.${saved ? "" : " Progress could not be saved."}`, 99);
  }
}

function tryCompleteMission() {
  if (state.mode === "running" && isMissionComplete(state.mission, state.task)) {
    persistAndFinish(true);
    return true;
  }
  return false;
}

function waterFern() {
  if (state.mode !== "running" || !state.fernRequesting || state.task.water >= state.mission.waterGoal) return;
  state.task.water++;
  state.fernRequesting = false;
  state.score += 2;
  state.fernWetUntil = performance.now() + 1800;
  audio.play(523.25, .24, "sine", .035);
  nodes.plantRequestStatus.textContent = "Fern watered. It is happy again.";
  setMessage("Fern watered! It has canceled its performance review.", 2.3);
  updateHud();
  tryCompleteMission();
}

function spawnTarget(now) {
  const { mission, task } = state;
  const taskPending = mission.taskKind === "reports"
    ? task.reports < mission.taskGoal
    : mission.taskKind === "phone" && task.phone < mission.taskGoal;
  const kind = chooseTargetKind(Math.random(), mission.taskKind, taskPending, state.nonHotSpawnStreak);
  state.nonHotSpawnStreak = kind === "hot" ? 0 : state.nonHotSpawnStreak + 1;
  const golden = kind === "hot" && Math.random() < .13;
  const radius = kind === "phone" ? 24 : kind === "report" ? 27 : golden ? 28 : randomBetween(22, 30);
  const angle = randomBetween(0, Math.PI * 2);
  const speed = getTargetSpeed(randomBetween(70, 110), mission, kind, golden);
  const x = randomBetween(radius + 15, WIDTH - radius - 15);
  const y = randomBetween(166 + radius, 378 - radius);
  targets.push({
    x,
    y,
    r: radius,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    wobble: randomBetween(0, Math.PI * 2),
    born: now,
    hue: Math.floor(randomBetween(0, 360)),
    kind,
    golden
  });
}

function spawnPest(now) {
  const x = WIDTH - 35;
  const y = randomBetween(210, 330);
  const dx = 690 - x;
  const dy = 365 - y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = 85 * state.mission.speedMultiplier;
  targets.push({
    x, y, r: 18,
    vx: dx / length * speed,
    vy: dy / length * speed,
    wobble: randomBetween(0, Math.PI * 2),
    born: now,
    hue: 0,
    kind: "bug",
    golden: false
  });
}

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#bac9b8");
  sky.addColorStop(.63, "#e4d6b8");
  sky.addColorStop(.64, "#b78c60");
  sky.addColorStop(1, "#92704f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#536861";
  ctx.fillRect(35, 36, 285, 150);
  ctx.fillStyle = "#a8d2c3";
  ctx.fillRect(44, 45, 267, 132);
  ctx.fillStyle = "#83b8aa";
  ctx.beginPath();
  ctx.arc(255, 77, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#80a58b";
  ctx.beginPath();
  ctx.moveTo(44, 163); ctx.lineTo(105, 105); ctx.lineTo(159, 155);
  ctx.lineTo(210, 111); ctx.lineTo(311, 170); ctx.lineTo(311, 177); ctx.lineTo(44, 177);
  ctx.fill();
  ctx.fillStyle = "#536861";
  ctx.fillRect(174, 45, 7, 132);
  ctx.fillRect(44, 107, 267, 7);

  ctx.fillStyle = "#7d6248";
  ctx.fillRect(748, 93, 157, 241);
  ctx.fillStyle = "#a78963";
  ctx.fillRect(758, 104, 137, 104);
  ctx.fillRect(758, 219, 137, 104);
  ctx.fillStyle = "#d9cba8";
  ctx.fillRect(814, 150, 26, 5);
  ctx.fillRect(814, 265, 26, 5);
  ctx.fillStyle = "#705741";
  ctx.fillRect(0, 394, WIDTH, 23);
  ctx.fillStyle = "#664c38";
  ctx.fillRect(0, 417, WIDTH, 123);

  const fernHappy = now < state.fernWetUntil;
  ctx.fillStyle = "#b78c60";
  ctx.fillRect(672, 345, 38, 48);
  ctx.fillStyle = fernHappy ? "#83b85f" : "#658363";
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(691, 351);
    ctx.rotate((i - 2) * .38 + (fernHappy ? Math.sin(now / 100) * .08 : 0));
    ctx.beginPath();
    ctx.ellipse(0, -20, 8, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (state.fernRequesting) {
    ctx.fillStyle = "#203229";
    ctx.beginPath();
    ctx.roundRect(649, 304, 84, 24, 8);
    ctx.fill();
    ctx.strokeStyle = "#ffd18a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffd18a";
    ctx.font = "bold 11px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WATER ME!", 691, 320);
    ctx.textAlign = "start";
  }
  drawActivityStations(now);
  ctx.fillStyle = "#534536";
  ctx.font = "bold 15px Trebuchet MS, sans-serif";
  ctx.fillText("Q3 GOALS", 62, 212);
  ctx.font = "12px Trebuchet MS, sans-serif";
  ctx.fillText("1. Catch mugs", 62, 234);
  ctx.fillText("2. Silence phone", 62, 253);
  ctx.fillText("3. Water fern", 62, 272);
  ctx.fillText("it is watching", 76, 289);

  ctx.fillStyle = "#e9e0cc";
  ctx.save();
  ctx.translate(440, 447);
  ctx.rotate(-.05);
  ctx.fillRect(0, 0, 145, 68);
  ctx.fillStyle = "#73847a";
  ctx.font = "bold 13px Trebuchet MS, sans-serif";
  ctx.fillText("URGENT", 12, 22);
  ctx.font = "11px Trebuchet MS, sans-serif";
  ctx.fillText("Re: the other email", 12, 42);
  ctx.restore();
  ctx.fillStyle = "#f7f4e9dd";
  ctx.font = "bold 13px Trebuchet MS, sans-serif";
  ctx.fillText(state.mode === "running" ? "BREAK ROOM INCIDENT IN PROGRESS" : "BREAK ROOM · 9:01 AM", 351, 34);
}

function drawActivityStations(now) {
  if (state.mission.taskKind === "printer") {
    ctx.fillStyle = "#26363a";
    ctx.beginPath();
    ctx.roundRect(760, 215, 142, 98, 10);
    ctx.fill();
    ctx.fillStyle = "#91a19c";
    ctx.fillRect(776, 231, 110, 17);
    ctx.fillStyle = "#e6ddc5";
    ctx.fillRect(788, 235, 88, 9);
    ctx.fillStyle = "#607476";
    ctx.fillRect(773, 270, 116, 28);
    ctx.fillStyle = "#172127";
    ctx.fillRect(781, 276, 100, 13);
    ctx.fillStyle = "#f5f0dd";
    ctx.font = "bold 11px Trebuchet MS, sans-serif";
    ctx.fillText("PAPER JAM", 804, 286);
    const parts = [[790, 259], [835, 259], [880, 259]];
    parts.forEach(([x, y], index) => {
      const active = index === state.task.printer;
      ctx.beginPath();
      ctx.arc(x, y, active ? 13 + Math.sin(now / 180) * 2 : 11, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#ffd84d" : index < state.task.printer ? "#86dfa3" : "#71817c";
      ctx.fill();
      ctx.fillStyle = "#172127";
      ctx.font = "900 12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), x, y + 4);
      ctx.textAlign = "start";
    });
    ctx.fillStyle = "#f7f4e9";
    ctx.font = "bold 11px Trebuchet MS, sans-serif";
    ctx.fillText("TAP LIGHTS IN ORDER", 772, 326);
  } else if (state.mission.taskKind === "sorting") {
    const colors = ["#db6c5f", "#63b4dc", "#e2ba47"];
    const names = ["RED", "BLUE", "GOLD"];
    const trayX = [390, 480, 570];
    trayX.forEach((x, index) => {
      ctx.fillStyle = "#203137";
      ctx.beginPath();
      ctx.roundRect(x - 37, 430, 74, 68, 7);
      ctx.fill();
      ctx.fillStyle = colors[index];
      ctx.fillRect(x - 30, 438, 60, 14);
      ctx.fillStyle = "#f7f4e9";
      ctx.font = "bold 12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(names[index], x, 477);
      ctx.textAlign = "start";
    });
    const tray = state.mission.sortingSequence[state.task.sorting] ?? 0;
    ctx.fillStyle = "#f0e7cf";
    ctx.beginPath();
    ctx.roundRect(449, 345, 62, 65, 4);
    ctx.fill();
    ctx.fillStyle = colors[tray];
    ctx.fillRect(456, 353, 48, 8);
    ctx.fillStyle = "#29393b";
    ctx.font = "bold 10px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("URGENT", 480, 378);
    ctx.fillText(state.sortingItemSelected ? "DROP IN TRAY" : "TAP TO PICK UP", 480, 394);
    ctx.textAlign = "start";
  }
}

function drawCoffee(target, now) {
  const age = (now - target.born) / 1000;
  const bob = Math.sin(age * 6 + target.wobble) * 4;
  const x = target.x;
  const y = target.y + bob;
  const r = target.r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(age * 3 + target.wobble) * .12);
  ctx.fillStyle = "#00000028";
  ctx.beginPath();
  ctx.ellipse(3, r * .92, r * .9, r * .24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = target.golden ? "#d39132" : `hsl(${target.hue} 40% 40%)`;
  ctx.lineWidth = r * .24;
  ctx.beginPath();
  ctx.arc(r * .72, -r * .08, r * .42, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = target.golden ? "#d8942f" : `hsl(${target.hue} 43% 48%)`;
  ctx.beginPath();
  ctx.roundRect(-r * .68, -r * .72, r * 1.38, r * 1.48, [5, 5, 11, 11]);
  ctx.fill();
  ctx.fillStyle = target.golden ? "#ffd264" : `hsl(${target.hue} 56% 75%)`;
  ctx.beginPath();
  ctx.roundRect(-r * .76, -r * .78, r * 1.32, r * 1.45, [5, 5, 10, 10]);
  ctx.fill();
  ctx.fillStyle = "#55443a";
  ctx.beginPath();
  ctx.ellipse(-r * .1, -r * .76, r * .62, r * .16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = target.kind === "cold" ? "#8de7f4" : "#694638";
  ctx.beginPath();
  ctx.ellipse(-r * .1, -r * .78, r * .49, r * .105, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#273337";
  ctx.beginPath();
  ctx.arc(-r * .24, -r * .05, r * .075, 0, Math.PI * 2);
  ctx.arc(r * .16, -r * .05, r * .075, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#273337";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-r * .04, r * .12, r * .17, .12, Math.PI - .12);
  ctx.stroke();
  if (target.kind === "cold") {
    ctx.fillStyle = "#d1fbff";
    ctx.font = `bold ${Math.round(r * .76)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("❄", -r * .1, r * .25);
  } else if (target.golden) {
    ctx.fillStyle = "#fff4b0";
    ctx.font = `bold ${Math.round(r * .54)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("★", -r * .1, r * .45);
  }
  ctx.restore();
  if (target.kind === "hot") {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      const sx = x - 7 + i * 14;
      const sy = y - r - 8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx - 8, sy - 10, sx + 7, sy - 15, sx, sy - 23);
      ctx.stroke();
    }
  }
}

function drawReport(target, now) {
  const bob = Math.sin((now - target.born) / 1000 * 6) * 3;
  ctx.save();
  ctx.translate(target.x, target.y + bob);
  ctx.rotate(Math.sin((now - target.born) / 1000 * 3) * .12);
  ctx.fillStyle = "#00000028";
  ctx.beginPath();
  ctx.ellipse(3, target.r * .92, target.r * .9, target.r * .24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = REPORT_PALETTE.shadow;
  ctx.lineWidth = target.r * .24;
  ctx.beginPath();
  ctx.arc(target.r * .67, -target.r * .08, target.r * .42, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = REPORT_PALETTE.shadow;
  ctx.beginPath();
  ctx.roundRect(-target.r * .68, -target.r * .72, target.r * 1.38, target.r * 1.48, [5, 5, 11, 11]);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.paper;
  ctx.beginPath();
  ctx.roundRect(-target.r * .76, -target.r * .78, target.r * 1.32, target.r * 1.45, [5, 5, 10, 10]);
  ctx.fill();
  ctx.fillStyle = "#775b1c";
  ctx.beginPath();
  ctx.ellipse(-target.r * .1, -target.r * .76, target.r * .62, target.r * .16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.label;
  ctx.beginPath();
  ctx.roundRect(-target.r * .48, -target.r * .32, target.r * .82, target.r * .76, 4);
  ctx.fill();
  ctx.fillStyle = REPORT_PALETTE.rule;
  ctx.fillRect(-target.r * .35, -target.r * .21, target.r * .55, target.r * .08);
  ctx.fillRect(-target.r * .35, -target.r * .04, target.r * .55, target.r * .08);
  ctx.fillStyle = REPORT_PALETTE.ink;
  ctx.font = `900 ${Math.round(target.r * .78)}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("!", -target.r * .08, target.r * .35);
  ctx.font = `900 ${Math.round(target.r * .24)}px Trebuchet MS, sans-serif`;
  ctx.fillText("RPT", -target.r * .08, target.r * .55);
  ctx.restore();
}

function drawPhone(target, now) {
  const age = (now - target.born) / 1000;
  const bob = Math.sin(age * 8) * 3;
  const remaining = Math.max(0, 5 - age);
  ctx.save();
  ctx.translate(target.x, target.y + bob);
  ctx.rotate(Math.sin(age * 9) * .07);
  ctx.fillStyle = "#172127";
  ctx.beginPath();
  ctx.roundRect(-target.r * .56, -target.r, target.r * 1.12, target.r * 1.9, 7);
  ctx.fill();
  ctx.fillStyle = "#b8ebf5";
  ctx.beginPath();
  ctx.roundRect(-target.r * .42, -target.r * .79, target.r * .84, target.r * 1.48, 4);
  ctx.fill();
  ctx.fillStyle = "#22839a";
  ctx.font = `bold ${Math.round(target.r * .32)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("PING!", 0, -target.r * .28);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, target.r * .42, target.r * .075, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#202d32cc";
  ctx.beginPath();
  ctx.arc(0, 0, target.r * 1.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining / 5);
  ctx.strokeStyle = "#34d9ef";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawPest(target, now) {
  const wobble = Math.sin(now / 75 + target.wobble) * 3;
  ctx.save();
  ctx.translate(target.x, target.y + wobble);
  ctx.fillStyle = "#9a542f";
  ctx.beginPath();
  ctx.ellipse(0, 1, target.r * .8, target.r * .55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4b3428";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 5, 5);
    ctx.lineTo(side * 18, 13);
    ctx.moveTo(side * 4, -2);
    ctx.lineTo(side * 15, -9);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffe6aa";
  ctx.beginPath();
  ctx.arc(-5, -2, 3, 0, Math.PI * 2);
  ctx.arc(5, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#30251e";
  ctx.beginPath();
  ctx.arc(-5, -2, 1.5, 0, Math.PI * 2);
  ctx.arc(5, -2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(dt) {
  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 80 * dt;
    if (particle.life <= 0) {
      particles.splice(index, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    ctx.fillStyle = particle.color;
    ctx.font = `bold ${particle.size}px Trebuchet MS, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(particle.text, particle.x, particle.y);
  }
  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (state.mode === "running") return;
  ctx.fillStyle = "#18272dce";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  if (state.mode === "ready" || state.mode === "browsing") {
    ctx.fillStyle = "#fff8e9";
    ctx.font = "900 38px Trebuchet MS, sans-serif";
    ctx.fillText("THE OFFICE HAS TOO MANY NOTIFICATIONS", WIDTH / 2, 228);
    ctx.fillStyle = "#dbe8d9";
    ctx.font = "20px Trebuchet MS, sans-serif";
    ctx.fillText("Finish every task. Avoid incidents to earn a commendation.", WIDTH / 2, 270);
    ctx.font = "16px Trebuchet MS, sans-serif";
    ctx.fillText("The mission board shows objectives and unlocks.", WIDTH / 2, 302);
  } else {
    ctx.fillStyle = "#fff8e9";
    ctx.font = "900 44px Trebuchet MS, sans-serif";
    const title = state.mode === "campaignComplete" ? "CAMPAIGN COMPLETE!" :
      state.mode === "missionComplete" ? "MISSION ACCOMPLISHED!" : "SHIFT OVER!";
    ctx.fillText(title, WIDTH / 2, 215);
    ctx.fillStyle = "#ffdd75";
    ctx.font = "900 30px Trebuchet MS, sans-serif";
    ctx.fillText(`${state.score} points earned`, WIDTH / 2, 263);
    ctx.fillStyle = "#e5e6d9";
    ctx.font = "19px Trebuchet MS, sans-serif";
    const review = state.mode === "campaignComplete"
      ? "The fern is now your manager."
      : state.mode === "missionComplete"
        ? "Next mission unlocked · zero incidents earns a commendation"
        : "The phone is still ringing. You can try again.";
    ctx.fillText(review, WIDTH / 2, 302);
  }
  ctx.textAlign = "start";
}

function render(now, dt) {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate(randomBetween(-state.shake, state.shake), randomBetween(-state.shake, state.shake));
    state.shake = Math.max(0, state.shake - 30 * dt);
  }
  drawBackground(now);
  for (const target of targets) {
    if (target.kind === "report") drawReport(target, now);
    else if (target.kind === "phone") drawPhone(target, now);
    else if (target.kind === "bug") drawPest(target, now);
    else drawCoffee(target, now);
  }
  drawParticles(dt);
  drawOverlay();
  ctx.restore();
}

function finishFailedMission() {
  if (state.mode !== "running") return;
  const saved = saveProgress(false);
  state.mode = "failed";
  state.timeLeft = Math.max(0, state.timeLeft);
  targets.length = 0;
  nodes.start.textContent = "Play this mission again";
  updateHud();
  setMessage(`Shift over. The phone is still ringing, but at least the fern is hydrated.${saved ? "" : " Progress could not be saved."}`, 99);
}

function update(dt, now) {
  if (state.mode !== "running") return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    finishFailedMission();
    return;
  }
  if (!state.fernRequesting && state.task.water < state.mission.waterGoal) {
    state.waterRequestClock -= dt;
    if (state.waterRequestClock <= 0) {
      state.fernRequesting = true;
      nodes.plantRequestStatus.textContent = "The fern needs water now. Tap the plant.";
      audio.playWaterRequest();
      setMessage("The fern needs water! Tap it when you can.", 4);
    }
  }
  state.spawnClock -= dt;
  if (state.spawnClock <= 0 && targets.length < state.mission.maxTargets) {
    spawnTarget(now);
    state.spawnClock = state.mission.spawnInterval;
  }
  if (state.mission.taskKind === "pests" && state.task.pests < state.mission.taskGoal) {
    state.pestClock -= dt;
    if (state.pestClock <= 0 && targets.length < state.mission.maxTargets + 1) {
      spawnPest(now);
      state.pestClock = 2.5;
    }
  }
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    target.x += target.vx * dt;
    target.y += target.vy * dt;
    const margin = target.r + 8;
    if (target.x < margin) { target.x = margin; target.vx = Math.abs(target.vx); }
    if (target.x > WIDTH - margin) { target.x = WIDTH - margin; target.vx = -Math.abs(target.vx); }
    if (target.y < 151 + target.r) { target.y = 151 + target.r; target.vy = Math.abs(target.vy); }
    if (target.y > 382 - target.r) { target.y = 382 - target.r; target.vy = -Math.abs(target.vy); }
    if (now - target.born > (target.kind === "phone" || target.kind === "bug" ? 5000 : 8500)) {
      targets.splice(index, 1);
      const penalty = applyTargetExpiry(target.kind, state.mission);
      state.incidents += penalty.incidents;
      state.timeLeft = Math.max(0, state.timeLeft + penalty.timeDelta);
      if (target.kind === "phone") {
        state.shake = 4;
        setMessage("Phone ignored! The whole office stopped to watch the notification.", 2.2);
      } else if (target.kind === "hot") {
        setMessage("A hot coffee escaped to a meeting that could've been an email.", 2.2);
      }
    }
  }
  updateHud();
}

function hitTarget(target) {
  const result = applyTargetHit(target.kind, target.golden);
  state.score += result.points;
  state.timeLeft = clampMissionTime(state.timeLeft, result.timeDelta, state.mission.durationSeconds);
  state.incidents += result.incidents;
  if (result.progress) state.task[result.progress]++;
  if (target.kind === "cold") {
    state.shake = 7;
    audio.play(145, .2, "sine", .04);
    setMessage("ICED COFFEE! Two seconds lost to the workplace hazard report.", 2.5);
  } else if (target.kind === "phone") {
    audio.play(659.25, .17, "sine", .03);
    setMessage("Phone silenced! The meeting can return to pretending to listen.", 2.2);
  } else if (target.kind === "report") {
    audio.play(880, .16, "sine", .03);
    setMessage("Yellow report filed! Finance has acknowledged receipt.", 2.2);
  } else if (target.kind === "bug") {
    audio.play(392, .18, "triangle", .04);
    setMessage("Pest tapped! The fern has requested a tiny security detail.", 2.2);
  } else {
    audio.play(target.golden ? 1046.5 : 740, .16, "sine", .025);
    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(35, 120);
      particles.push({
        x: target.x, y: target.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: randomBetween(.45, .9), size: randomBetween(13, 21),
        color: target.golden ? "#ffd264" : `hsl(${target.hue} 65% 72%)`,
        text: target.golden ? "★" : "☕"
      });
    }
    setMessage(target.golden ? "FAST GOLDEN COFFEE! Three points. Tiny trophy!" :
      coffeeQuips[Math.floor(Math.random() * coffeeQuips.length)], 1.8);
  }
  updateHud();
  tryCompleteMission();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * WIDTH / rect.width,
    y: (event.clientY - rect.top) * HEIGHT / rect.height
  };
}

function tapPrinterPart(point) {
  if (state.mission.taskKind !== "printer" || state.task.printer >= state.mission.taskGoal) return false;
  const parts = [[790, 259], [835, 259], [880, 259]];
  const clicked = parts.findIndex(([x, y]) => (point.x - x) ** 2 + (point.y - y) ** 2 <= 22 ** 2);
  if (clicked < 0) return false;
  if (clicked === state.task.printer) {
    state.task.printer++;
    state.score += 2;
    audio.play(523.25, .16, "sine", .03);
    setMessage("Printer part cleared. The paper jam has been formally warned.", 2);
  } else {
    state.incidents++;
    state.timeLeft = Math.max(0, state.timeLeft - 2);
    setMessage("Wrong printer part! Follow the blinking lights in order.", 2.2);
  }
  updateHud();
  tryCompleteMission();
  return true;
}

function tapSortingStation(point) {
  if (state.mission.taskKind !== "sorting" || state.task.sorting >= state.mission.taskGoal) return false;
  if (point.x >= 449 && point.x <= 511 && point.y >= 345 && point.y <= 410) {
    state.sortingItemSelected = true;
    setMessage("Document picked up. Match its color to a tray.", 1.8);
    return true;
  }
  const trays = [[353, 427, 427, 505], [443, 427, 517, 505], [533, 427, 607, 505]];
  const clicked = trays.findIndex(([left, top, right, bottom]) =>
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom);
  if (clicked < 0) return false;
  if (!state.sortingItemSelected) {
    setMessage("Pick up the urgent document first.", 1.8);
  } else if (clicked === state.mission.sortingSequence[state.task.sorting]) {
    state.task.sorting++;
    state.sortingItemSelected = false;
    state.score += 2;
    audio.play(659.25, .16, "sine", .03);
    setMessage("Correct tray! The filing cabinet is briefly impressed.", 2);
    tryCompleteMission();
  } else {
    state.incidents++;
    state.score = Math.max(0, state.score - 1);
    setMessage("Wrong tray. The document has filed a complaint.", 2);
  }
  updateHud();
  return true;
}

canvas.addEventListener("pointerdown", event => {
  if (state.mode !== "running") return;
  event.preventDefault();
  const point = canvasPoint(event);
  if (state.mission.waterGoal > state.task.water &&
      point.x >= 646 && point.x <= 738 && point.y >= 326 && point.y <= 404) {
    waterFern();
    return;
  }
  if (tapPrinterPart(point) || tapSortingStation(point)) return;
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    if (dx * dx + dy * dy <= (target.r + 11) ** 2) {
      targets.splice(index, 1);
      hitTarget(target);
      break;
    }
  }
});

function openMissionBrowser() {
  if (state.mode === "running") return;
  updateMissionCards();
  nodes.missionBrowser.showModal();
}

function moveMission(direction) {
  const target = getAdjacentMissionIndex(state.selectedIndex, direction, state.progress);
  if (target === undefined) return;
  selectMission(target);
  state.mode = "browsing";
  nodes.start.textContent = "Start mission";
  setMessage(`Mission ${target + 1} selected. Open Missions to see all objectives.`, 3);
  updateHud();
}

nodes.missionBrowserButton.addEventListener("click", openMissionBrowser);
nodes.closeMissionBrowser.addEventListener("click", () => nodes.missionBrowser.close());
nodes.previousMission.addEventListener("click", () => moveMission(-1));
nodes.nextMission.addEventListener("click", () => moveMission(1));
nodes.start.addEventListener("click", startMission);
nodes.music.addEventListener("click", async () => {
  try {
    const enabled = await audio.toggleMusic();
    nodes.music.setAttribute("aria-pressed", String(enabled));
    nodes.music.textContent = enabled ? "♫ Music: On" : "♫ Music: Off";
    setMessage(enabled ? "The original office tune is back." : "Quiet mode. The fern approves.", 2.5);
  } catch (error) {
    console.error("Could not initialize music.", error);
    setMessage("This browser could not start music.", 3);
  }
});
nodes.volume.addEventListener("input", () => {
  const volume = Number(nodes.volume.value);
  audio.setVolume(volume / 100);
  nodes.volumeValue.textContent = `${volume}%`;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch (error) {
    console.error("Could not save the Office Mayhem volume setting.", error);
    setMessage("Volume changed, but the setting could not be saved.", 3);
  }
});

function loop(now) {
  const dt = Math.min(.04, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.messageClock > 0) {
    state.messageClock -= dt;
    if (state.messageClock <= 0 && state.mode === "running") {
      nodes.message.textContent = formatTaskHint();
    }
  }
  update(dt, now);
  audio.update();
  render(now, dt);
  requestAnimationFrame(loop);
}

updateMissionPicker();
updateHud();
nodes.missionBrowser.showModal();
requestAnimationFrame(now => {
  state.lastFrame = now;
  loop(now);
});
