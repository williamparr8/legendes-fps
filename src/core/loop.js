export const FIXED_DT = 1 / 60;

// Simulation à pas fixe + rendu interpolé (alpha = fraction du pas restant).
// `keepAlive()` : en ligne, la simulation doit continuer même si l'onglet est masqué (requestAnimationFrame est alors suspendu) :
// un ticker dans un Worker (non bridé) prend le relais sans rendu.
export function startLoop(update, render, keepAlive) {
  let last = performance.now();
  let acc = 0;
  function step(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    while (acc >= FIXED_DT) {
      update(FIXED_DT);
      acc -= FIXED_DT;
    }
    return dt;
  }
  function frame(now) {
    const dt = step(now);
    render(acc / FIXED_DT, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (keepAlive && typeof Worker !== 'undefined') {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'], { type: 'text/javascript' })));
      w.onmessage = () => { if (document.hidden && keepAlive()) step(performance.now()); };
    } catch (e) { /* sans Worker : la simulation s'arrête avec l'onglet masqué */ }
  }
}
