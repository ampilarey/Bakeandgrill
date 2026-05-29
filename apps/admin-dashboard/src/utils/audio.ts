const AUDIO_KEY = 'bg_audio_alerts';

export function isAudioEnabled(): boolean {
  try { return localStorage.getItem(AUDIO_KEY) !== 'off'; }
  catch { return true; }
}

export function setAudioEnabled(on: boolean): void {
  try { localStorage.setItem(AUDIO_KEY, on ? 'on' : 'off'); }
  catch { /* ignore */ }
}

export function playChime(): void {
  if (!isAudioEnabled()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 1108, 1318]; // A5 → C#6 → E6 (A-major arpeggio)
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type           = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => void ctx.close(), 2500);
  } catch { /* AudioContext not available */ }
}

/** Late ticket — lower two-tone alert (matches kds-web). */
export function playLateAlert(): void {
  if (!isAudioEnabled()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [440, 330].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => void ctx.close(), 2500);
  } catch { /* AudioContext not available */ }
}
