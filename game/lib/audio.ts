'use client';

// Background music is a shuffled playlist of licensed lofi/chill tracks
// (public/audio/, Pixabay Content License -- free for commercial use, no
// attribution required). Everything else -- taps, correct/wrong chimes,
// claps -- is synthesized with the Web Audio API, no file needed.

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

const TRACKS = [
  '/audio/alex-morgan-lofi-coffee-shop-568150.mp3',
  '/audio/alex-morgan-lofi-hip-hop-funky-midnight-club-560062.mp3',
  '/audio/alex-morgan-lofi-midnight-club-568164.mp3',
  '/audio/bodleasons-lofi-chill-smooth-chill-lofi-for-vlogs-and-background-music-159456.mp3',
  '/audio/kulakovka-chill-hip-hop-298924.mp3',
  '/audio/lofi_music_library-lofi-coffee-lofi-ambient-music-458909.mp3',
  '/audio/mirostar-study-lofi-music-560307.mp3',
];
// Music is a mastered recording; the game sounds below are raw synthesized
// tones, which are quiet at the same nominal gain. These levels are tuned
// so the two actually sit together instead of being picked independently.
const NORMAL_VOLUME = 0.07;
const DUCKED_VOLUME = 0.025;

let musicEl: HTMLAudioElement | null = null;
let lastTrack = -1;
let ducked = false;

function pickTrack(): string {
  if (TRACKS.length === 1) return TRACKS[0];
  let index = Math.floor(Math.random() * TRACKS.length);
  while (index === lastTrack) index = Math.floor(Math.random() * TRACKS.length);
  lastTrack = index;
  return TRACKS[index];
}

function playNextTrack() {
  if (!musicEl) return;
  musicEl.src = pickTrack();
  void musicEl.play().catch(() => { /* autoplay can still be blocked; ignored */ });
}

// Browsers don't pause background <audio> on their own when a phone locks
// or the tab is backgrounded -- that's deliberate, so a web page can act
// like a music/podcast player. For a game, the opposite is expected: stop
// when you leave, pick back up (if sound is still on) when you return.
// Registered once at module load, not per-play.
let wasPlayingBeforeHidden = false;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!musicEl) return;
    if (document.hidden) {
      wasPlayingBeforeHidden = !musicEl.paused;
      musicEl.pause();
    } else if (wasPlayingBeforeHidden) {
      void musicEl.play().catch(() => { /* ignored */ });
    }
  });
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
  }
  return ctx;
}

function pluck(context: AudioContext, destination: AudioNode, freq: number, time: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

/** A single synthesized "clap" -- filtered white noise with a fast
 * attack/decay, the standard drum-machine way to fake a hand clap
 * without a sample. Layering a few of these gives a crowd-cheer feel. */
function clap(context: AudioContext, destination: AudioNode, time: number, volume: number) {
  const bufferSize = Math.floor(context.sampleRate * 0.2);
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1500 + Math.random() * 800;
  bandpass.Q.value = 0.8;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(destination);
  noise.start(time);
  noise.stop(time + 0.2);
}

export function startMusic() {
  if (typeof window === 'undefined') return;
  if (musicEl) { void musicEl.play().catch(() => { /* ignored */ }); return; }
  musicEl = new Audio();
  musicEl.volume = ducked ? DUCKED_VOLUME : NORMAL_VOLUME;
  musicEl.addEventListener('ended', playNextTrack);
  playNextTrack();
}

export function stopMusic() {
  if (!musicEl) return;
  musicEl.removeEventListener('ended', playNextTrack);
  musicEl.pause();
  musicEl = null;
}

/** Lower the background music while a puzzle is actively being solved. */
export function duckMusic(low: boolean) {
  ducked = low;
  if (musicEl) musicEl.volume = low ? DUCKED_VOLUME : NORMAL_VOLUME;
}

/** A bright ascending chime plus a little burst of synthesized "claps" --
 * a small crowd-cheer moment for a correct answer, all synthesized. */
export function playCorrect() {
  const context = getCtx();
  if (!context) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, index) => pluck(context, context.destination, freq, context.currentTime + index * 0.08, 0.35, 0.58));
  const clapStart = context.currentTime + 0.22;
  for (let i = 0; i < 6; i += 1) clap(context, context.destination, clapStart + i * 0.055 + Math.random() * 0.02, 0.4);
  vibrate([22, 28, 42]);
}

/** Wrong answers get an extra boost over the general SFX level -- it
 * should read as a clear, attention-getting "no", not a quiet blip. */
export function playWrong() {
  const context = getCtx();
  if (!context) return;
  [349.23, 293.66].forEach((freq, index) => pluck(context, context.destination, freq, context.currentTime + index * 0.09, 0.2, 0.55, 'sawtooth'));
  vibrate(34);
}

export function playTap() {
  const context = getCtx();
  if (!context) return;
  pluck(context, context.destination, 880, context.currentTime, 0.08, 0.28);
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* vibration is optional */ }
}

/** A wooden-glass tile lift followed by a quieter socket click. */
export function playTileSnap(direction: 'place' | 'remove' = 'place') {
  const context = getCtx();
  if (!context) return;
  const now = context.currentTime;
  if (direction === 'place') {
    pluck(context, context.destination, 720, now, 0.075, 0.24, 'triangle');
    pluck(context, context.destination, 1080, now + 0.045, 0.09, 0.18, 'sine');
    vibrate(9);
  } else {
    pluck(context, context.destination, 620, now, 0.07, 0.18, 'triangle');
  }
}

export function playShuffle() {
  const context = getCtx();
  if (!context) return;
  [640, 760, 680].forEach((frequency, index) => pluck(context, context.destination, frequency, context.currentTime + index * 0.045, 0.08, 0.16));
  vibrate(7);
}

export function playStarFill(star = 1) {
  const context = getCtx();
  if (!context) return;
  const root = 659.25 * (1 + (Math.max(1, star) - 1) * 0.12);
  pluck(context, context.destination, root, context.currentTime, 0.32, 0.34, 'sine');
  pluck(context, context.destination, root * 1.5, context.currentTime + 0.06, 0.36, 0.25, 'triangle');
}

export function playRewardFanfare() {
  const context = getCtx();
  if (!context) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => pluck(context, context.destination, frequency, context.currentTime + index * 0.11, 0.5, 0.32, 'triangle'));
  vibrate([18, 35, 18, 35, 38]);
}
