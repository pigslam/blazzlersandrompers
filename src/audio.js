(function () {
  let audioContext = null;
  let masterGain = null;
  let lastTickTime = 0;
  let queuedSounds = [];
  let activeSources = new Set();
  let soundEnabled = false;

  function ensureAudio() {
    soundEnabled = true;

    if (!audioContext) {
      audioContext = new AudioContext();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.16;
      masterGain.connect(audioContext.destination);
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  function setSoundEnabled(enabled) {
    soundEnabled = enabled;

    if (soundEnabled) {
      ensureAudio();
    } else {
      suspendAudio();
    }
  }

  function isSoundEnabled() {
    return soundEnabled;
  }

  function playTone({ frequency, type = "sine", duration, volume, slideTo = frequency }) {
    if (!audioContext || audioContext.state !== "running") {
      return;
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(masterGain);
    trackActiveSource(oscillator);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function playNoise(duration, volume) {
    if (!audioContext || audioContext.state !== "running") {
      return;
    }

    const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }

    const now = audioContext.currentTime;
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = 1300;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    trackActiveSource(source);
    source.start(now);
  }

  function trackActiveSource(source) {
    activeSources.add(source);
    source.addEventListener("ended", () => activeSources.delete(source), { once: true });
  }

  function playBounceSound() {
    if (!soundEnabled) {
      return;
    }

    queuedSounds.push("bounce");
  }

  function playChompSound() {
    if (!soundEnabled) {
      return;
    }

    queuedSounds.push("chomp");
  }

  function playSplashSound() {
    if (!soundEnabled) {
      return;
    }

    queuedSounds.push("splash");
  }

  function flushQueuedSounds() {
    if (queuedSounds.length === 0) {
      return;
    }

    const sounds = queuedSounds;
    queuedSounds = [];

    if (!audioContext || audioContext.state !== "running") {
      return;
    }

    for (const sound of sounds) {
      if (sound === "bounce") {
        playBounceSoundNow();
      } else if (sound === "chomp") {
        playChompSoundNow();
      } else if (sound === "splash") {
        playSplashSoundNow();
      }
    }
  }

  function stopActiveSounds() {
    queuedSounds = [];
    lastTickTime = 0;

    for (const source of activeSources) {
      try {
        source.stop();
      } catch (error) {
        // The source may already be stopped by the time cleanup runs.
      }
    }

    activeSources = new Set();
  }

  function suspendAudio() {
    stopActiveSounds();

    if (audioContext && audioContext.state === "running") {
      audioContext.suspend();
    }
  }

  function closeAudio() {
    stopActiveSounds();

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close();
    }

    audioContext = null;
    masterGain = null;
    soundEnabled = false;
  }

  function playBounceSoundNow() {
    if (!audioContext || audioContext.state !== "running") {
      return;
    }

    const now = audioContext.currentTime;
    if (now - lastTickTime < 0.025) {
      return;
    }

    lastTickTime = now;
    playTone({ frequency: 950, type: "square", duration: 0.035, volume: 0.08, slideTo: 620 });
  }

  function playChompSoundNow() {
    playTone({ frequency: 170, type: "sawtooth", duration: 0.11, volume: 0.12, slideTo: 70 });
    playNoise(0.08, 0.08);
  }

  function playSplashSoundNow() {
    playTone({ frequency: 360, type: "triangle", duration: 0.14, volume: 0.1, slideTo: 760 });
    playNoise(0.16, 0.06);
  }

  Object.assign(window.Blazzlers, {
    ensureAudio,
    closeAudio,
    flushQueuedSounds,
    isSoundEnabled,
    playBounceSound,
    playChompSound,
    playSplashSound,
    setSoundEnabled,
    suspendAudio,
  });
}());
