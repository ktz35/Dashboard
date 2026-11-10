/* Столбчатые графики на SVG: факт столбиками (можно составными), план — отметкой. */
'use strict';

const Tooltip = {
  el: null,
  show(html, x, y) {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'tooltip'; this.el.setAttribute('role', 'tooltip'); document.body.appendChild(this.el); }
    this.el.innerHTML = html; this.el.style.display = 'block';
    const r = this.el.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 10;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 16;
    this.el.style.left = left + 'px'; this.el.style.top = top + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
};

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * opts: { data: [{date, plan, parts:[{label, value, cls}]}], desc, highlightBelow, tooltip(d) }
 */
function barChart(container, opts) {
  const draw = () => {
    container.innerHTML = '';
    const W = Math.max(280, container.clientWidth || 640), H = W < 480 ? 210 : 250;
    const m = { t: 22, r: 6, b: 26, l: W < 480 ? 34 : 42 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const data = opts.data;
    const totals = data.map(d => d.parts.reduce((s, p) => s + p.value, 0));
    const max = Math.max(1, ...totals, ...data.map(d => d.plan || 0)) * 1.12;
    const y = v => m.t + ih - (v / max) * ih;
    const n = data.length, slot = iw / n, bw = Math.min(46, slot * 0.64);

    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.desc, class: 'chart-svg' });
    svg.appendChild(svgEl('title', {}, opts.desc));

    // Сетка и шкала (тыс. т)
    const step = niceStep(max / 4);
    for (let v = 0; v <= max; v += step) {
      svg.appendChild(svgEl('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: m.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, nf0.format(v / 1000)));
    }
    svg.appendChild(svgEl('text', { x: m.l - 6, y: m.t - 9, class: 'axis', 'text-anchor': 'end' }, 'тыс. т'));

    const labelEvery = slot < 30 ? 2 : 1;
    data.forEach((d, i) => {
      const x0 = m.l + i * slot + (slot - bw) / 2, total = totals[i];
      const ratio = d.plan ? total / d.plan : NaN;
      const below = opts.highlightBelow && ratio < THRESHOLDS.PLAN_WARN;
      const isLast = i === n - 1;
      const g = svgEl('g', { class: 'bar-group' + (below ? ' below' : '') + (isLast ? ' last' : '') });
      let acc = 0;
      d.parts.forEach(p => {
        const h = (p.value / max) * ih;
        g.appendChild(svgEl('rect', { x: x0, y: y(acc + p.value), width: bw, height: Math.max(0, h), class: 'bar ' + (below ? 'bar-bad' : p.cls), rx: 1.5 }));
        acc += p.value;
      });
      if (d.plan) {
        const ext = Math.max(0, Math.min(3, (slot - bw) / 2 - 2));
        g.appendChild(svgEl('line', { x1: x0 - ext, x2: x0 + bw + ext, y1: y(d.plan), y2: y(d.plan), class: 'plan-mark' }));
      }
      // Подпись значения над столбцом
      if (slot >= 30 || isLast || below) {
        g.appendChild(svgEl('text', { x: x0 + bw / 2, y: Math.min(y(total), d.plan ? y(d.plan) : y(total)) - 5,
          class: 'value-label' + (below ? ' bad' : ''), 'text-anchor': 'middle' }, Fmt.kt(total)));
      }
      if (i % labelEvery === (n - 1) % labelEvery) {
        g.appendChild(svgEl('text', { x: x0 + bw / 2, y: H - 8, class: 'axis' + (isLast ? ' strong' : ''), 'text-anchor': 'middle' }, Fmt.dateShort(d.date)));
      }
      // Область наведения
      const hit = svgEl('rect', { x: m.l + i * slot, y: m.t, width: slot, height: ih, class: 'hit', tabindex: 0,
        'aria-label': opts.ariaPoint ? opts.ariaPoint(d, total) : '' });
      const html = opts.tooltip(d, total);
      const show = ev => {
        const r = ev.type === 'focus' ? hit.getBoundingClientRect() : null;
        Tooltip.show(html, r ? r.left + r.width / 2 : ev.clientX, r ? r.top + 30 : ev.clientY);
        g.classList.add('hover');
      };
      hit.addEventListener('mousemove', show); hit.addEventListener('focus', show);
      const hide = () => { Tooltip.hide(); g.classList.remove('hover'); };
      hit.addEventListener('mouseleave', hide); hit.addEventListener('blur', hide);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    container.appendChild(svg);
  };
  draw();
  if (window.ResizeObserver) {
    let w = container.clientWidth;
    new ResizeObserver(() => { if (Math.abs(container.clientWidth - w) > 4) { w = container.clientWidth; draw(); } }).observe(container);
  }
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Горизонтальная шкала-распределение (по состояниям). items: [{key, n, cls}] */
function distribution(items, total, label) {
  const segs = items.filter(i => i.n > 0).map(i =>
    `<span class="dseg ${i.cls}" style="flex:${i.n}" title="${i.key}: ${i.n}"></span>`).join('');
  const legend = items.map(i => `<li><span class="dot ${i.cls}"></span>${i.key}<b>${i.n}</b></li>`).join('');
  return `<div class="distribution" role="img" aria-label="${label}: ${items.map(i => i.key + ' ' + i.n).join(', ')} из ${total}">
    <div class="dist-bar">${segs}</div><ul class="dist-legend">${legend}</ul></div>`;
}
