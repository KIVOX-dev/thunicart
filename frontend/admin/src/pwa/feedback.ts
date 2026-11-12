let ctx: AudioContext | null = null;

/** Short beep for a good scan, lower tone for a miss. Silent if the browser blocks audio. */
export function beep(ok = true) {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1100 : 300;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.25));
  } catch { /* audio not available */ }
  try { navigator.vibrate?.(ok ? 30 : [60, 40, 60]); } catch { /* not supported */ }
}
