(function () {
  const {
    AUTO_RESTART_SECONDS,
    MAX_DELTA_SECONDS,
    READY_COUNTDOWN_SECONDS,
    SPEED_STEP_RATIO,
    checkWinner,
    closeAudio,
    draw,
    ensureAudio,
    flushQueuedSounds,
    getCounts,
    isSoundEnabled,
    resetSimulation,
    resizeCanvas,
    setSoundEnabled,
    state,
    stepSimulation,
    suspendAudio,
  } = window.Blazzlers;

const canvas = document.getElementById("world");
const worldWrap = document.querySelector(".world-wrap");
const ctx = canvas.getContext("2d");
const stats = document.getElementById("stats");
const roundStats = document.getElementById("roundStats");
const winnerMessage = document.getElementById("winnerMessage");
const speedDisplay = document.getElementById("speedDisplay");
const slowButton = document.getElementById("slowButton");
const fastButton = document.getElementById("fastButton");
const pauseButton = document.getElementById("pauseButton");
const soundButton = document.getElementById("soundButton");
const resetButton = document.getElementById("resetButton");
const WINS_STORAGE_KEY = "blazzlers-session-wins";

function loadSessionWins() {
  try {
    const storedWins = JSON.parse(sessionStorage.getItem(WINS_STORAGE_KEY));

    if (
      Number.isFinite(storedWins?.blazzlers) &&
      Number.isFinite(storedWins?.rompers)
    ) {
      state.sessionWins.blazzlers = storedWins.blazzlers;
      state.sessionWins.rompers = storedWins.rompers;
    }
  } catch (error) {
    state.sessionWins.blazzlers = 0;
    state.sessionWins.rompers = 0;
  }
}

function saveSessionWins() {
  try {
    sessionStorage.setItem(WINS_STORAGE_KEY, JSON.stringify(state.sessionWins));
  } catch (error) {
    // The in-memory tally still works when sessionStorage is unavailable.
  }
}

function updateStats() {
  const { blazzlers, rompers } = getCounts();
  stats.textContent = `Blazzlers: ${blazzlers} | Rompers: ${rompers}`;

  const winner = checkWinner(blazzlers, rompers);
  if (winner) {
    handleWinner(winner);
  }
}

function handleWinner(winner) {
  if (!state.winnerRecorded) {
    state.sessionWins[winner] += 1;
    state.winnerRecorded = true;
    state.nextRoundAt = performance.now() + AUTO_RESTART_SECONDS * 1000;
    saveSessionWins();
    updateRoundStats();
  }

  updateWinnerMessage(AUTO_RESTART_SECONDS);
}

function updateWinnerMessage(secondsRemaining) {
  winnerMessage.textContent = `${state.winner} win\nNext round in ${secondsRemaining}`;
  winnerMessage.hidden = false;
}

function updateRoundStats() {
  roundStats.textContent = (
    `Round: ${state.roundNumber} | ` +
    `Blazzlers wins: ${state.sessionWins.blazzlers} | ` +
    `Rompers wins: ${state.sessionWins.rompers}`
  );
}

function updateSpeedDisplay() {
  speedDisplay.textContent = `${state.speedMultiplier.toFixed(1).replace(".0", "")}x`;
}

function updateRunButton() {
  pauseButton.textContent = state.paused && !state.readyCountdownUntil ? "Start" : "Pause";
}

function updateSoundButton() {
  const soundEnabled = isSoundEnabled();
  soundButton.textContent = soundEnabled ? "Sound On" : "Sound Off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
}

function pauseSimulation({ hideMessage = false } = {}) {
  state.paused = true;
  state.readyCountdownUntil = null;
  state.nextRoundAt = null;
  suspendAudio();

  if (hideMessage) {
    winnerMessage.hidden = true;
    winnerMessage.textContent = "";
  }

  updateRunButton();
}

function resetAndRender() {
  resetSimulation();
  pauseSimulation({ hideMessage: true });
  winnerMessage.hidden = true;
  winnerMessage.textContent = "";
  updateStats();
  updateRoundStats();
  updateRunButton();
}

function startReadyCountdown(timestamp) {
  state.roundNumber += 1;
  resetSimulation();
  state.paused = true;
  state.readyCountdownUntil = timestamp + (READY_COUNTDOWN_SECONDS + 1) * 1000;
  updateStats();
  updateRoundStats();
  updateReadyCountdown(timestamp);
  updateRunButton();
}

function updateAutoRestart(timestamp) {
  if (!state.winner || state.paused || !state.nextRoundAt) {
    return;
  }

  const millisecondsRemaining = state.nextRoundAt - timestamp;

  if (millisecondsRemaining <= 0) {
    startReadyCountdown(timestamp);
    return;
  }

  updateWinnerMessage(Math.ceil(millisecondsRemaining / 1000));
}

function updateReadyCountdown(timestamp) {
  if (!state.readyCountdownUntil) {
    return;
  }

  const millisecondsRemaining = state.readyCountdownUntil - timestamp;

  if (millisecondsRemaining <= 0) {
    state.readyCountdownUntil = null;
    state.paused = false;
    winnerMessage.hidden = true;
    winnerMessage.textContent = "";
    updateRunButton();
    return;
  }

  const countdownDuration = (READY_COUNTDOWN_SECONDS + 1) * 1000;
  const elapsedSeconds = Math.floor((countdownDuration - millisecondsRemaining) / 1000);
  const count = READY_COUNTDOWN_SECONDS - elapsedSeconds;
  winnerMessage.textContent = count > 0 ? String(count) : "Go!";
  winnerMessage.hidden = false;
}

function frame(timestamp) {
  if (!state.lastFrameTime) {
    state.lastFrameTime = timestamp;
  }

  const deltaSeconds = Math.min(MAX_DELTA_SECONDS, (timestamp - state.lastFrameTime) / 1000);
  state.lastFrameTime = timestamp;

  if (state.readyCountdownUntil) {
    updateReadyCountdown(timestamp);
  } else if (!state.paused && !state.winner) {
    stepSimulation(deltaSeconds);
    updateStats();
  } else if (state.winner) {
    updateAutoRestart(timestamp);
  }

  draw(ctx);
  flushQueuedSounds();
  requestAnimationFrame(frame);
}

pauseButton.addEventListener("click", () => {
  if (state.readyCountdownUntil) {
    pauseSimulation({ hideMessage: true });
    return;
  }

  if (state.paused && state.winner) {
    if (isSoundEnabled()) {
      ensureAudio();
    }

    startReadyCountdown(performance.now());
    return;
  }

  state.paused = !state.paused;

  if (state.paused && state.winner) {
    pauseSimulation();
    winnerMessage.textContent = `${state.winner} win`;
  } else if (state.paused) {
    pauseSimulation();
  } else {
    if (isSoundEnabled()) {
      ensureAudio();
    }
  }

  updateRunButton();
});

soundButton.addEventListener("click", () => {
  setSoundEnabled(!isSoundEnabled());
  updateSoundButton();
});

slowButton.addEventListener("click", () => {
  state.speedMultiplier = Math.max(0.1, state.speedMultiplier / SPEED_STEP_RATIO);
  updateSpeedDisplay();
});

fastButton.addEventListener("click", () => {
  state.speedMultiplier *= SPEED_STEP_RATIO;
  updateSpeedDisplay();
});

resetButton.addEventListener("click", () => {
  resetAndRender();
});

canvas.addEventListener("pointerdown", () => {
  if (isSoundEnabled() && (!state.paused || state.readyCountdownUntil)) {
    ensureAudio();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseSimulation();
    updateSoundButton();
  }
});

window.addEventListener("pagehide", () => {
  closeAudio();
  updateSoundButton();
});
window.addEventListener("beforeunload", closeAudio);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(() => resizeCanvas(canvas, worldWrap, ctx));
  resizeObserver.observe(worldWrap);
} else {
  window.addEventListener("resize", () => resizeCanvas(canvas, worldWrap, ctx));
}

resizeCanvas(canvas, worldWrap, ctx);
loadSessionWins();
resetAndRender();
updateSpeedDisplay();
updateSoundButton();
requestAnimationFrame(frame);
}());
