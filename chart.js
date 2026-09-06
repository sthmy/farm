import { fmtPrice } from './market.js';

const UP = '#3FC7C0';
const DOWN = '#E23E57';

export function createChart(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let cross = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  const start = e => { cross = point(e); };
  const move = e => { if (cross) { cross = point(e); e.preventDefault(); } };
  const end = () => { cross = null; };

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
  window.addEventListener('resize', resize);
  resize();

  function fmt(p) {
    return fmtPrice(p);
  }

  function box(x, y, w2, h2, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w2, h2, r); return; }
    ctx.beginPath();
    ctx.rect(x, y, w2, h2);
  }

  function draw(data, color) {
    if (!w || !h || !data.length) return;
    const padR = 58, padB = 18, padT = 10;
    const plotW = w - padR;
    const plotH = h - padB - padT;

    let hi = -Infinity, lo = Infinity;
    for (const c of data) { if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; }
    const pad = (hi - lo) * 0.14 || hi * 0.02;
    hi += pad;
    lo -= pad;
    const y = p => padT + (hi - p) / (hi - lo) * plotH;

    ctx.clearRect(0, 0, w, h);

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const p = lo + (hi - lo) * i / 4;
      const gy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(plotW, gy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(233,226,240,.38)';
      ctx.textAlign = 'left';
      ctx.fillText(fmt(p), plotW + 8, gy);
    }

    const step = plotW / data.length;
    const bw = Math.max(1.5, Math.min(step * 0.62, 14));
    data.forEach((c, i) => {
      const cx = i * step + step / 2;
      const up = c.c >= c.o;
      const col = up ? UP : DOWN;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.globalAlpha = c.live ? 1 : 0.92;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, y(c.h));
      ctx.lineTo(Math.round(cx) + 0.5, y(c.l));
      ctx.stroke();
      const top = y(Math.max(c.o, c.c));
      const bh = Math.max(Math.abs(y(c.o) - y(c.c)), 1.5);
      ctx.fillRect(cx - bw / 2, top, bw, bh);
    });
    ctx.globalAlpha = 1;

    const last = data[data.length - 1].c;
    const ly = Math.round(y(last)) + 0.5;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(plotW, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    box(plotW + 2, ly - 9, padR - 4, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#14101E';
    ctx.textAlign = 'center';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillText(fmt(last), plotW + padR / 2, ly);

    if (cross && cross.x < plotW) {
      const i = Math.max(0, Math.min(data.length - 1, Math.floor(cross.x / step)));
      const c = data[i];
      const cx = Math.round(i * step + step / 2) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, padT + plotH);
      ctx.stroke();
      const label = `О ${fmt(c.o)}  М ${fmt(c.h)}  Н ${fmt(c.l)}  З ${fmt(c.c)}`;
      ctx.font = '10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(label).width + 14;
      const bx = Math.max(2, Math.min(cx - tw / 2, plotW - tw));
      ctx.fillStyle = 'rgba(20,16,30,.92)';
      box(bx, 2, tw, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#E9E2F0';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 7, 12);
    }
  }

  return { draw, resize };
}

export function sparkline(el, values, color) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(1)},${(24 - (v - min) / span * 22).toFixed(1)}`);
  el.innerHTML = `<svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
