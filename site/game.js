import { ErhuSynth } from "./audio-engine.js";
import { PITCHES, SONGS, PracticeSession, pitchById } from "./game-core.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  songSelect: $("#songSelect"),
  pieceEyebrow: $("#pieceEyebrow"),
  currentNote: $("#currentNote"),
  currentScale: $("#currentScale"),
  scoreBowDirection: $("#scoreBowDirection"),
  score: $("#score"),
  combo: $("#combo"),
  noteLane: $("#noteLane"),
  progressBar: $("#progressBar"),
  progressText: $("#progressText"),
  songSubtitle: $("#songSubtitle"),
  pitchGrid: $("#pitchGrid"),
  bowTitle: $("#bowTitle"),
  bowBadge: $("#bowBadge"),
  bowPad: $("#bowPad"),
  feedback: $("#feedback"),
  feedbackDot: $("#feedbackDot"),
  accuracy: $("#accuracy"),
  resetButton: $("#resetButton"),
  startButton: $("#startButton"),
  startButtonText: $("#startButtonText"),
  soundButton: $("#soundButton"),
  helpButton: $("#helpButton"),
  guideDialog: $("#guideDialog"),
  enterButton: $("#enterButton"),
  resultDialog: $("#resultDialog"),
  resultTitle: $("#resultTitle"),
  resultScore: $("#resultScore"),
  resultAccuracy: $("#resultAccuracy"),
  resultCombo: $("#resultCombo"),
  resultReplayButton: $("#resultReplayButton"),
  resultFreeButton: $("#resultFreeButton"),
};

const synth = new ErhuSynth();
const session = new PracticeSession(SONGS[0]);
let selectedPitch = PITCHES[0].id;
let mode = "practice";
let muted = false;
let pointer = null;
let feedbackState = "neutral";

function syncViewportHeight() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
}

function updateInstrumentMotion(xPercent = 50) {
  const normalized = Math.max(-1, Math.min(1, (xPercent - 50) / 27));
  const shift = Math.min(8, window.innerWidth * 0.018);
  document.documentElement.style.setProperty("--erhu-x", `${(normalized * shift).toFixed(2)}px`);
  document.documentElement.style.setProperty("--erhu-y", `${(-Math.abs(normalized) * 1.5).toFixed(2)}px`);
  document.documentElement.style.setProperty("--erhu-rotate", `${(normalized * 0.9).toFixed(2)}deg`);
}

function buildStaticUI() {
  elements.songSelect.innerHTML = SONGS.map((song) => `<option value="${song.id}">${song.title}</option>`).join("");
  elements.pitchGrid.innerHTML = PITCHES.map((pitch, index) => `
    <button class="pitch-key${index === 0 ? " active" : ""}" type="button" data-pitch="${pitch.id}" aria-pressed="${index === 0}">
      <span class="key-number">${index + 1}</span>
      <strong>${pitch.note}</strong>
      <small>${pitch.string}</small>
    </button>
  `).join("");

  elements.pitchGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pitch]");
    if (!button) return;
    selectedPitch = button.dataset.pitch;
    void synth.unlock();
    render();
  });
}

function currentTarget() {
  const snapshot = session.snapshot();
  return session.song.notes[snapshot.activeIndex] ?? session.song.notes[0];
}

function setMode(nextMode) {
  mode = nextMode;
  synth.endTone();
  pointer = null;
  delete document.body.dataset.bowing;
  updateInstrumentMotion(50);
  if (mode === "free") {
    session.pause();
    feedbackState = "neutral";
  }
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.body.dataset.mode = mode;
  render();
}

function render() {
  const snapshot = session.snapshot();
  const target = currentTarget();
  const shownPitch = mode === "practice" ? pitchById(target.pitch) : pitchById(selectedPitch);
  const targetDirection = target.bow;

  document.querySelectorAll("[data-pitch]").forEach((button) => {
    const active = button.dataset.pitch === selectedPitch;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  elements.score.textContent = String(snapshot.score).padStart(4, "0");
  elements.combo.textContent = `×${snapshot.combo}`;
  elements.accuracy.textContent = `准确率 ${snapshot.accuracy}%`;
  elements.feedback.textContent = mode === "free" ? `自由演奏 · 当前音位 ${pitchById(selectedPitch).note}` : snapshot.message;
  elements.feedbackDot.className = `feedback-dot ${feedbackState}`;
  elements.songSubtitle.textContent = mode === "free" ? "不计分 · 随心拉奏" : session.song.subtitle;
  elements.progressText.textContent = mode === "free" ? "自由" : `${snapshot.completed} / ${snapshot.total}`;
  elements.progressBar.style.width = mode === "free" ? "100%" : `${(snapshot.completed / snapshot.total) * 100}%`;
  elements.currentNote.textContent = shownPitch.note;
  elements.currentScale.textContent = shownPitch.scale;
  document.body.dataset.string = pitchById(selectedPitch).string === "内弦" ? "inner" : "outer";

  if (mode === "free") {
    elements.pieceEyebrow.textContent = "自由演奏 · 当前音位";
    elements.scoreBowDirection.textContent = "自由推拉 ↔";
    elements.bowTitle.textContent = "横向拖动，自由推拉";
    elements.bowBadge.textContent = "推 ↔ 拉";
    elements.bowPad.classList.remove("target-pull", "target-push");
    elements.noteLane.innerHTML = PITCHES.slice(0, 7).map((pitch) => `<span class="note-token free-note">${pitch.scale}</span>`).join("");
    elements.startButton.disabled = true;
    elements.startButtonText.textContent = "自由演奏中";
  } else {
    const label = targetDirection === "pull" ? "拉弓" : "推弓";
    elements.pieceEyebrow.textContent = "当前一音";
    elements.scoreBowDirection.textContent = targetDirection === "pull" ? "拉弓 →" : "← 推弓";
    elements.bowTitle.textContent = targetDirection === "pull" ? "这一弓，向右拉" : "这一弓，向左推";
    elements.bowBadge.textContent = targetDirection === "pull" ? "拉弓 →" : "← 推弓";
    elements.bowPad.classList.toggle("target-pull", targetDirection === "pull");
    elements.bowPad.classList.toggle("target-push", targetDirection === "push");
    elements.noteLane.innerHTML = session.song.notes.slice(snapshot.activeIndex, snapshot.activeIndex + 7).map((note, index) => {
      const pitch = pitchById(note.pitch);
      return `<span class="note-token${index === 0 ? " current" : ""}"><b>${pitch.scale}</b><small>${note.bow === "pull" ? "拉" : "推"}</small></span>`;
    }).join("");
    elements.startButton.disabled = false;
    elements.startButton.classList.toggle("paused", snapshot.status === "playing");
    elements.startButtonText.textContent = snapshot.status === "playing" ? "暂停练习" : snapshot.status === "finished" ? "再奏一遍" : "开始练习";
  }
}

function resetPractice() {
  synth.endTone();
  delete document.body.dataset.bowing;
  session.reset();
  selectedPitch = session.song.notes[0].pitch;
  feedbackState = "neutral";
  elements.bowPad.style.setProperty("--bow-x", "50%");
  updateInstrumentMotion(50);
  render();
}

function celebrate(snapshot) {
  elements.resultTitle.textContent = `稳稳拉完《${session.song.title}》`;
  elements.resultScore.textContent = snapshot.score;
  elements.resultAccuracy.textContent = `${snapshot.accuracy}%`;
  elements.resultCombo.textContent = snapshot.maxCombo;
  window.setTimeout(() => elements.resultDialog.showModal(), 360);
}

function judgeBow(direction) {
  if (mode === "free") {
    feedbackState = "neutral";
    elements.feedback.textContent = `${pitchById(selectedPitch).note} · ${direction === "pull" ? "拉弓" : "推弓"}`;
    return;
  }

  const result = session.perform(selectedPitch, direction);
  if (result.ignored) {
    feedbackState = "neutral";
  } else if (result.hit) {
    feedbackState = "hit";
    elements.bowPad.classList.remove("hit-flash");
    void elements.bowPad.offsetWidth;
    elements.bowPad.classList.add("hit-flash");
    if (navigator.vibrate) navigator.vibrate(18);
  } else {
    feedbackState = "miss";
    elements.bowPad.classList.remove("miss-shake");
    void elements.bowPad.offsetWidth;
    elements.bowPad.classList.add("miss-shake");
    if (navigator.vibrate) navigator.vibrate([22, 32, 22]);
  }

  const snapshot = session.snapshot();
  render();
  if (result.finished) celebrate(snapshot);
}

function onPointerDown(event) {
  event.preventDefault();
  elements.bowPad.setPointerCapture(event.pointerId);
  const rect = elements.bowPad.getBoundingClientRect();
  pointer = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, lastTime: performance.now(), triggered: false };
  elements.bowPad.classList.add("dragging");
  elements.bowPad.style.setProperty("--bow-x", `${Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100))}%`);
  void synth.unlock();
}

function onPointerMove(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  event.preventDefault();
  const rect = elements.bowPad.getBoundingClientRect();
  const xPercent = Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100));
  elements.bowPad.style.setProperty("--bow-x", `${xPercent}%`);
  updateInstrumentMotion(xPercent);

  const delta = event.clientX - pointer.startX;
  if (Math.abs(delta) < 12) return;
  const now = performance.now();
  const step = Math.abs(event.clientX - pointer.lastX);
  const elapsed = Math.max(8, now - pointer.lastTime);
  const velocity = step / elapsed;
  const intensity = Math.max(0.32, Math.min(1, Math.abs(delta) / 120 + velocity * 0.35));
  const direction = delta > 0 ? "pull" : "push";

  synth.beginTone(selectedPitch, direction, intensity);
  synth.updateTone(selectedPitch, intensity);
  document.body.dataset.bowing = direction;
  elements.bowPad.dataset.direction = direction;
  elements.bowPad.style.setProperty("--bow-energy", String(intensity));
  if (!pointer.triggered) {
    pointer.triggered = true;
    judgeBow(direction);
  }
  pointer.lastX = event.clientX;
  pointer.lastTime = now;
}

function onPointerEnd(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  pointer = null;
  synth.endTone();
  delete document.body.dataset.bowing;
  elements.bowPad.classList.remove("dragging");
  elements.bowPad.style.setProperty("--bow-energy", "0");
  window.setTimeout(() => {
    elements.bowPad.style.setProperty("--bow-x", "50%");
    updateInstrumentMotion(50);
  }, 120);
}

elements.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
elements.songSelect.addEventListener("change", () => {
  const song = SONGS.find((item) => item.id === elements.songSelect.value) ?? SONGS[0];
  session.setSong(song);
  selectedPitch = song.notes[0].pitch;
  feedbackState = "neutral";
  render();
});
elements.startButton.addEventListener("click", async () => {
  await synth.unlock();
  const snapshot = session.snapshot();
  if (snapshot.status === "playing") session.pause();
  else {
    if (snapshot.status === "finished") selectedPitch = session.song.notes[0].pitch;
    session.start();
  }
  feedbackState = "neutral";
  render();
});
elements.resetButton.addEventListener("click", resetPractice);
elements.soundButton.addEventListener("click", async () => {
  muted = !muted;
  if (!muted) await synth.unlock();
  synth.setMuted(muted);
  elements.soundButton.classList.toggle("muted", muted);
  elements.soundButton.setAttribute("aria-pressed", String(muted));
  elements.soundButton.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
  elements.soundButton.querySelector("span").textContent = muted ? "静音" : "声音";
});
elements.bowPad.addEventListener("pointerdown", onPointerDown);
elements.bowPad.addEventListener("pointermove", onPointerMove);
elements.bowPad.addEventListener("pointerup", onPointerEnd);
elements.bowPad.addEventListener("pointercancel", onPointerEnd);
elements.helpButton.addEventListener("click", () => elements.guideDialog.showModal());
elements.enterButton.addEventListener("click", async () => {
  await synth.unlock();
  elements.guideDialog.close();
  localStorage.setItem("erhu-guide-seen", "yes");
});
elements.resultReplayButton.addEventListener("click", () => {
  elements.resultDialog.close();
  resetPractice();
  session.start();
  render();
});
elements.resultFreeButton.addEventListener("click", () => {
  elements.resultDialog.close();
  setMode("free");
});

document.addEventListener("keydown", (event) => {
  const number = Number(event.key);
  if (number >= 1 && number <= 8) {
    selectedPitch = PITCHES[number - 1].id;
    render();
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? "pull" : "push";
    void synth.unlock().then(() => {
      synth.beginTone(selectedPitch, direction, 0.62);
      judgeBow(direction);
      window.setTimeout(() => synth.endTone(), 460);
    });
  }
});

buildStaticUI();
syncViewportHeight();
window.addEventListener("resize", syncViewportHeight, { passive: true });
window.addEventListener("orientationchange", syncViewportHeight, { passive: true });
window.visualViewport?.addEventListener("resize", syncViewportHeight, { passive: true });
render();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
