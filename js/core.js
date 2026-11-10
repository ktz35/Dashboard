/* Слой данных: реестр наборов, CSV, форматирование, расчёты (PRD, раздел 5). */
'use strict';

// ---------- Пороги (PRD, открытый вопрос 7) ----------
const THRESHOLDS = {
  PLAN_WARN: 0.9,   // ниже 90% плана — красный
  PLAN_OK: 1.0,     // от 100% — зелёный
  IDLE_DAYS: 3,     // простой вагона от 3 суток выделяется
  WAVE_M: 2.5,      // волна от 2,5 м — предупреждение
  GUST_MS: 20,      // порывы от 20 м/с — предупреждение
};

// ---------- Реестр наборов ----------
const DATASET_ORDER = ['sites', 'throughput', 'station_terminals', 'weather', 'routes', 'companies',
  'ships', 'flights', 'wagons', 'issues', 'digest'];
const RAW = {};
function registerDataset(name, meta) { RAW[name] = meta; }

// Поля, которые всегда строки, даже если похожи на число
const STRING_FIELDS = new Set(['wagon', 'flight', 'vessel', 'id', 'aircraft']);

// ---------- CSV ----------
const CSV = {
  parse(text) {
    text = text.replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    if (!rows.length) return { header: [], records: [] };
    const header = rows[0].map(h => h.trim());
    const records = rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, i) => {
        let v = (r[i] ?? '').trim();
        if (!STRING_FIELDS.has(h) && /^-?\d+([.,]\d+)?$/.test(v)) v = Number(v.replace(',', '.'));
        o[h] = v;
      });
      return o;
    });
    return { header, records };
  },
  stringify(header, records) {
    const esc = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [header.join(','), ...records.map(r => header.map(h => esc(r[h])).join(','))].join('\n') + '\n';
  },
};

// ---------- Хранилище: встроенные данные + загруженные пользователем файлы ----------
const OVERRIDE_KEY = n => 'dash.override.' + n;
const Store = {
  sets: {},
  load() {
    for (const name of DATASET_ORDER) {
      const meta = RAW[name];
      if (!meta) { console.warn('Нет набора', name); continue; }
      let csv = meta.csv, updated = meta.updated, origin = 'встроенный файл data/' + name + '.js', overridden = false;
      try {
        const ov = JSON.parse(localStorage.getItem(OVERRIDE_KEY(name)) || 'null');
        if (ov && ov.csv) { csv = ov.csv; updated = ov.updated; origin = 'загружен файл ' + ov.filename; overridden = true; }
      } catch (e) { /* хранилище недоступно — используем встроенные данные */ }
      const parsed = CSV.parse(csv);
      this.sets[name] = { name, title: meta.title, source: meta.source, status: overridden ? 'Загружено' : meta.status,
        updated, origin, overridden, header: parsed.header, rows: parsed.records };
    }
  },
  rows(name) { return this.sets[name] ? this.sets[name].rows : []; },
  meta(name) { return this.sets[name]; },
  override(name, csv, filename) {
    const parsed = CSV.parse(csv);
    const need = this.sets[name].header;
    const missing = need.filter(h => !parsed.header.includes(h));
    if (missing.length) throw new Error('В файле нет колонок: ' + missing.join(', '));
    const now = new Date();
    const updated = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    localStorage.setItem(OVERRIDE_KEY(name), JSON.stringify({ csv, filename, updated }));
  },
  reset(name) { try { localStorage.removeItem(OVERRIDE_KEY(name)); } catch (e) { /* ignore */ } },
  csv(name) { const s = this.sets[name]; return CSV.stringify(s.header, s.rows); },
};

// ---------- Форматирование (ru-RU) ----------
function pad(n) { return String(n).padStart(2, '0'); }
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const Fmt = {
  t: v => nf0.format(Math.round(v || 0)),
  n: v => nf0.format(v || 0),
  n1: v => nf1.format(v || 0),
  kt: v => nf1.format((v || 0) / 1000),
  pct: v => (v === null || v === undefined || !isFinite(v)) ? '—' : nf0.format(Math.round(v * 100)) + '%',
  delta: v => (!isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v * 100)) + '%'),
  date: s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}.${m}.${y}`; },
  dateShort: s => { const [, m, d] = String(s).slice(0, 10).split('-'); return `${d}.${m}`; },
  dt: s => { if (!s) return '—'; const str = String(s).replace('T', ' '); return Fmt.date(str) + (str.length > 10 ? ' ' + str.slice(11, 16) : ''); },
  time: s => s ? String(s).replace('T', ' ').slice(11, 16) : '—',
  plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  },
};

// Класс цвета по выполнению плана
function planClass(r) { if (!isFinite(r)) return ''; return r >= THRESHOLDS.PLAN_OK ? 'ok' : r >= THRESHOLDS.PLAN_WARN ? 'warn' : 'bad'; }
// Класс цвета по текстовому статусу
function statusClass(s) {
  const v = String(s || '').toLowerCase();
  if (/(норма|в графике|прибыл|закрыт|в полёте|в рейсе|по расписанию|низк)/.test(v)) return 'ok';
  if (/(вниман|отстав|в работе|средн|на рейде|под погр|под выгр)/.test(v)) return 'warn';
  if (/(критич|задерж|высок|открыт|в ремонте|простой|сбой)/.test(v)) return 'bad';
  return 'neutral';
}

// ---------- Расчёты ----------
const Calc = {
  sites() { return [...Store.rows('sites')].sort((a, b) => a.order - b.order); },
  site(name) { return Store.rows('sites').find(s => s.object === name); },
  stations() { return [...new Set(Store.rows('station_terminals').map(r => r.station))]; },
  isStation(name) { return this.stations().includes(name); },

  // Перевалка с учётом правила согласованности: станция = сумма её терминалов
  throughputRows() {
    if (this._tp) return this._tp;
    const st = Store.rows('station_terminals');
    const sums = {};
    for (const r of st) {
      const k = r.date + '|' + r.station;
      sums[k] = sums[k] || { date: r.date, object: r.station, plan_t: 0, fact_t: 0 };
      sums[k].plan_t += r.plan_t || 0; sums[k].fact_t += r.fact_t || 0;
    }
    const rows = Store.rows('throughput').filter(r => !sums[r.date + '|' + r.object]);
    this._tp = rows.concat(Object.values(sums));
    return this._tp;
  },
  dates() { return [...new Set(this.throughputRows().map(r => r.date))].sort(); },
  lastDate() { const d = this.dates(); return d[d.length - 1]; },
  prevDate() { const d = this.dates(); return d[d.length - 2]; },

  // Перевалка по суткам — вся сеть
  daily() {
    const by = {};
    for (const r of this.throughputRows()) {
      by[r.date] = by[r.date] || { date: r.date, plan: 0, fact: 0 };
      by[r.date].plan += r.plan_t || 0; by[r.date].fact += r.fact_t || 0;
    }
    return Object.values(by).sort((a, b) => a.date < b.date ? -1 : 1).slice(-14);
  },

  // Перевалка по объектам: последние сутки и 7 суток
  byObject(name) {
    const last = this.lastDate(), dates = this.dates().slice(-7);
    const rows = this.throughputRows().filter(r => r.object === name);
    const day = rows.find(r => r.date === last) || { plan_t: 0, fact_t: 0 };
    const prev = rows.find(r => r.date === this.prevDate()) || { plan_t: 0, fact_t: 0 };
    const w = rows.filter(r => dates.includes(r.date));
    const plan7 = w.reduce((s, r) => s + (r.plan_t || 0), 0), fact7 = w.reduce((s, r) => s + (r.fact_t || 0), 0);
    return { plan: day.plan_t, fact: day.fact_t, pct: day.plan_t ? day.fact_t / day.plan_t : NaN,
      prevFact: prev.fact_t, plan7, fact7, pct7: plan7 ? fact7 / plan7 : NaN };
  },

  // Станция по суткам: наши / сторонние
  stationDaily(station) {
    const by = {};
    for (const r of Store.rows('station_terminals').filter(r => r.station === station)) {
      by[r.date] = by[r.date] || { date: r.date, plan: 0, fact: 0, own: 0, ext: 0 };
      const d = by[r.date];
      d.plan += r.plan_t || 0; d.fact += r.fact_t || 0;
      if (r.owner_type === 'Наша компания') d.own += r.fact_t || 0; else d.ext += r.fact_t || 0;
    }
    return Object.values(by).sort((a, b) => a.date < b.date ? -1 : 1).slice(-14);
  },
  stationTotals(station) {
    const d = this.stationDaily(station);
    const last = d[d.length - 1] || { plan: 0, fact: 0, own: 0, ext: 0 }, prev = d[d.length - 2];
    return { ...last, pct: last.plan ? last.fact / last.plan : NaN,
      ownShare: last.fact ? last.own / last.fact : NaN, extShare: last.fact ? last.ext / last.fact : NaN,
      change: prev && prev.fact ? last.fact / prev.fact - 1 : NaN };
  },
  stationTerminals(station) {
    const rows = Store.rows('station_terminals').filter(r => r.station === station);
    const dates = [...new Set(rows.map(r => r.date))].sort();
    const last = dates[dates.length - 1], d7 = dates.slice(-7);
    const total = rows.filter(r => r.date === last).reduce((s, r) => s + (r.fact_t || 0), 0);
    const names = [...new Set(rows.map(r => r.terminal))];
    return names.map(t => {
      const tr = rows.filter(r => r.terminal === t), day = tr.find(r => r.date === last) || {};
      return { terminal: t, owner: (tr[0] || {}).owner_type, cargo: (tr[0] || {}).cargo,
        plan: day.plan_t || 0, fact: day.fact_t || 0, pct: day.plan_t ? day.fact_t / day.plan_t : NaN,
        share: total ? (day.fact_t || 0) / total : NaN,
        fact7: tr.filter(r => d7.includes(r.date)).reduce((s, r) => s + (r.fact_t || 0), 0) };
    }).sort((a, b) => (a.owner === 'Наша компания' ? 0 : 1) - (b.owner === 'Наша компания' ? 0 : 1));
  },

  openIssues(filter = {}) {
    return Store.rows('issues').filter(i => i.status !== 'Закрыт'
      && (!filter.area || i.area === filter.area) && (!filter.object || i.object === filter.object));
  },
  issuesByArea(area) {
    const sev = { 'Высокий': 0, 'Средний': 1, 'Низкий': 2 }, st = { 'Открыт': 0, 'В работе': 1, 'Закрыт': 2 };
    return Store.rows('issues').filter(i => i.area === area)
      .sort((a, b) => (st[a.status] - st[b.status]) || (sev[a.severity] - sev[b.severity]) || (a.opened < b.opened ? 1 : -1));
  },
  weather(name) { return Store.rows('weather').find(w => w.object === name); },
  wagonsAt(name) {
    const w = Store.rows('wagons').filter(x => x.location === name);
    return { total: w.length, idle: w.filter(x => x.status === 'Простой').length };
  },
  shipsAt(port) {
    const s = Store.rows('ships').filter(x => x.location === port);
    return { berth: s.filter(x => x.status === 'У причала').length, roads: s.filter(x => x.status === 'На рейде').length,
      repair: s.filter(x => x.status === 'В ремонте').length };
  },
  countBy(rows, field, order) {
    const m = {}; for (const r of rows) m[r[field]] = (m[r[field]] || 0) + 1;
    const keys = order || Object.keys(m);
    return keys.map(k => ({ key: k, n: m[k] || 0 }));
  },

  kpis() {
    const daily = this.daily(), last = daily[daily.length - 1] || { plan: 0, fact: 0 }, prev = daily[daily.length - 2];
    const wagons = Store.rows('wagons'), ships = Store.rows('ships'), flights = Store.rows('flights');
    const open = this.openIssues();
    return {
      date: last.date, fact: last.fact, plan: last.plan, pct: last.plan ? last.fact / last.plan : NaN,
      change: prev && prev.fact ? last.fact / prev.fact - 1 : NaN,
      wagons: wagons.length, wagonsIdle: wagons.filter(w => w.status === 'Простой').length,
      ships: ships.length, shipsVoyage: ships.filter(s => s.status === 'В рейсе').length, shipsRepair: ships.filter(s => s.status === 'В ремонте').length,
      flights: flights.length, flightsDelayed: flights.filter(f => f.status === 'Задержан').length,
      issues: open.length, issuesHigh: open.filter(i => i.severity === 'Высокий').length,
    };
  },
};
