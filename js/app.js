/* Интерфейс дашборда: шапка, ключевые показатели, вкладки, страница станции, блок «О данных». */
'use strict';

const TABS = [
  { id: 'routes', title: 'Маршруты', render: renderRoutes },
  { id: 'companies', title: 'Компании', render: renderCompanies },
  { id: 'volumes', title: 'Объёмы', render: renderVolumes },
  { id: 'terminals', title: 'Терминалы', render: renderTerminals },
  { id: 'ports', title: 'Порты', render: renderPorts },
  { id: 'ships', title: 'Корабли', render: renderShips },
  { id: 'planes', title: 'Самолёты', render: renderPlanes },
  { id: 'wagons', title: 'Вагоны', render: renderWagons },
  { id: 'digest', title: 'Дайджест', render: renderDigest },
];

const UI_KEY = 'dash.ui';
const state = Object.assign({ tab: 'routes', station: null, returnTab: 'volumes', termFilter: 'all', wagonFilter: 'all', digestTopic: 'all' },
  safeJSON(() => localStorage.getItem(UI_KEY)) || {});
state.station = null;

function safeJSON(get) { try { return JSON.parse(get() || 'null'); } catch (e) { return null; } }
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: state.tab, termFilter: state.termFilter, wagonFilter: state.wagonFilter, digestTopic: state.digestTopic })); } catch (e) { /* ignore */ } }

// ---------- Мелкие помощники разметки ----------
const $ = sel => document.querySelector(sel);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const chip = s => `<span class="chip ${statusClass(s)}">${esc(s)}</span>`;
const pct = r => `<span class="pct ${planClass(r)}">${Fmt.pct(r)}</span>`;
function meter(r, cls) {
  const w = Math.max(0, Math.min(100, (r || 0) * 100));
  return `<span class="meter ${cls || planClass(r)}" role="img" aria-label="${Fmt.pct(r)}"><span style="width:${w}%"></span></span>`;
}
function fillClass(r) { return r >= 0.9 ? 'bad' : r >= 0.75 ? 'warn' : 'ok'; }
function stationLink(name) {
  return Calc.isStation(name)
    ? `<a href="#station/${encodeURIComponent(name)}" class="station-link" data-station="${esc(name)}">${esc(name)} →</a>`
    : esc(name);
}
function srcNote(...names) {
  return `<div class="src">${names.map(n => {
    const m = Store.meta(n); if (!m) return '';
    return `<span>Источник: ${esc(m.source)} <em class="tag ${m.overridden ? 'ok' : 'neutral'}">${esc(m.status)}</em> · обновлено ${Fmt.dt(m.updated)}
      · <button type="button" class="linkbtn" data-dl="${n}" title="Скачать набор «${esc(m.title)}» в CSV">CSV ↓</button></span>`;
  }).join('')}</div>`;
}
/** cols: [{h, f(row), num, cls(row)}] */
function table(cols, rows, opts = {}) {
  const head = cols.map(c => `<th scope="col" class="${c.num ? 'num' : ''}">${c.h}</th>`).join('');
  const body = rows.length ? rows.map(r => `<tr class="${opts.rowCls ? opts.rowCls(r) : ''}">${cols.map(c =>
    `<td class="${c.num ? 'num' : ''} ${c.cls ? c.cls(r) : ''}" data-h="${esc(c.h.replace(/<[^>]+>/g, ''))}"><span class="cv">${c.f(r)}</span></td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" class="empty">Нет данных</td></tr>`;
  const foot = opts.foot ? `<tfoot><tr>${opts.foot.map((v, i) => `<td class="${cols[i].num ? 'num' : ''}">${v}</td>`).join('')}</tr></tfoot>` : '';
  return `<div class="table-wrap${opts.stack ? ' stack' : ''}"><table${opts.caption ? ` aria-label="${esc(opts.caption)}"` : ''}><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
function section(title, body, extra = '') { return `<section class="panel"><div class="panel-head"><h3>${title}</h3>${extra}</div>${body}</section>`; }

function issuesBlock(area, title = 'Проблемы') {
  const rows = Calc.issuesByArea(area);
  const open = rows.filter(r => r.status !== 'Закрыт').length;
  return section(`${title} <span class="count">${open} ${Fmt.plural(open, 'открыта', 'открыты', 'открыто')}</span>`,
    table([
      { h: 'Открыта', f: r => Fmt.date(r.opened) },
      { h: 'Объект', f: r => stationLink(r.object) },
      { h: 'Категория', f: r => esc(r.category) },
      { h: 'Описание', f: r => esc(r.description), cls: () => 'wide' },
      { h: 'Приоритет', f: r => chip(r.severity) },
      { h: 'Ответственный', f: r => esc(r.owner) },
      { h: 'Статус', f: r => chip(r.status) },
    ], rows, { stack: true, caption: title + ': ' + area, rowCls: r => r.status === 'Закрыт' ? 'muted' : '' }) + srcNote('issues'));
}

// ---------- Шапка и ключевые показатели ----------
function renderHeader() {
  const k = Calc.kpis();
  $('#lead').innerHTML = `За ${Fmt.date(k.date)} перевалено <b>${Fmt.t(k.fact)} т</b> — <b class="${planClass(k.pct)}-text">${Fmt.pct(k.pct)} плана</b>.
    В простое ${k.wagonsIdle} ${Fmt.plural(k.wagonsIdle, 'вагон', 'вагона', 'вагонов')},
    открыто ${k.issuesHigh} ${Fmt.plural(k.issuesHigh, 'проблема', 'проблемы', 'проблем')} высокого приоритета.`;
  const updated = DATASET_ORDER.map(n => Store.meta(n)).filter(Boolean).map(m => m.updated).sort().pop();
  $('#asof').textContent = `Данные за ${Fmt.date(k.date)} · последнее обновление ${Fmt.dt(updated)}`;
  const demo = DATASET_ORDER.some(n => Store.meta(n) && Store.meta(n).status === 'Демо');
  $('#demo-flag').hidden = !demo;

  const card = (label, value, sub, cls, src, tab) => `
    <${tab ? `button type="button" data-tab="${tab}"` : 'div'} class="kpi ${cls}" title="Источник: ${esc(src)}">
      <span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span>
    </${tab ? 'button' : 'div'}>`;
  const chg = isFinite(k.change) ? `<span class="${k.change >= 0 ? 'ok' : 'bad'}-text">${Fmt.delta(k.change)}</span> к пред. суткам` : '—';
  $('#kpis').innerHTML = [
    card('Перевалка за сутки, т', Fmt.t(k.fact), chg, 'neutral', Store.meta('throughput').source, 'volumes'),
    card('Выполнение плана', `<span class="${planClass(k.pct)}-text">${Fmt.pct(k.pct)}</span>`, `план ${Fmt.t(k.plan)} т`, planClass(k.pct), Store.meta('throughput').source, 'volumes'),
    card('Вагоны', Fmt.n(k.wagons), `в простое <b class="${k.wagonsIdle ? 'bad' : 'ok'}-text">${k.wagonsIdle}</b>`, k.wagonsIdle ? 'warn' : 'ok', Store.meta('wagons').source, 'wagons'),
    card('Суда в рейсе', `${k.shipsVoyage} <small>из ${k.ships}</small>`, `в ремонте <b class="${k.shipsRepair ? 'warn' : 'ok'}-text">${k.shipsRepair}</b>`, k.shipsRepair ? 'warn' : 'ok', Store.meta('ships').source, 'ships'),
    card('Авиарейсы', Fmt.n(k.flights), `задержано <b class="${k.flightsDelayed ? 'bad' : 'ok'}-text">${k.flightsDelayed}</b>`, k.flightsDelayed ? 'warn' : 'ok', Store.meta('flights').source, 'planes'),
    card('Открытые проблемы', Fmt.n(k.issues), `высокого приоритета <b class="${k.issuesHigh ? 'bad' : 'ok'}-text">${k.issuesHigh}</b>`, k.issuesHigh ? 'bad' : 'ok', Store.meta('issues').source),
  ].join('');
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t => {
    const open = issueCountForTab(t.id);
    const active = !state.station && state.tab === t.id;
    return `<button type="button" role="tab" id="tab-${t.id}" aria-controls="view" aria-selected="${active}" tabindex="${active ? 0 : -1}" data-tab="${t.id}">
      ${t.title}${open ? `<span class="badge" aria-label="открытых проблем: ${open}">${open}</span>` : ''}</button>`;
  }).join('');
}
function issueCountForTab(id) {
  const area = { routes: 'Маршруты', companies: 'Компании', terminals: 'Терминалы', ports: 'Порты', ships: 'Корабли', planes: 'Самолёты', wagons: 'Вагоны' }[id];
  return area ? Calc.openIssues({ area }).length : 0;
}

// ---------- Разделы ----------
function renderRoutes() {
  const rows = Store.rows('routes');
  return section('Маршруты и коридоры', table([
    { h: 'Маршрут', f: r => `<b>${esc(r.route)}</b>` },
    { h: 'Коридор', f: r => esc(r.corridor) },
    { h: 'Вид', f: r => esc(r.mode) },
    { h: 'Объём с начала месяца, т', f: r => Fmt.t(r.volume_mtd_t), num: true },
    { h: 'План, т', f: r => Fmt.t(r.plan_mtd_t), num: true },
    { h: '% плана', f: r => { const x = r.volume_mtd_t / r.plan_mtd_t; return pct(x) + meter(x); }, num: true },
    { h: 'Срок доставки, сут', f: r => esc(r.avg_days), num: true, cls: r => r.avg_days > r.norm_days ? 'over' : '' },
    { h: 'Норматив, сут', f: r => esc(r.norm_days), num: true },
    { h: 'Статус', f: r => chip(r.status) },
  ], rows, { stack: true, caption: 'Маршруты' }) + `<p class="hint">Срок доставки сверх норматива выделен красным.</p>` + srcNote('routes'))
    + issuesBlock('Маршруты', 'Проблемы по маршрутам');
}

function renderCompanies() {
  const cards = Store.rows('companies').map(c => {
    const v = c.volume_mtd_t / c.plan_mtd_t, r = c.revenue_mtd_mln_kzt / c.revenue_plan_mln_kzt;
    const open = Calc.openIssues({ object: c.company }).length;
    return `<article class="card status-${statusClass(c.status)}">
      <header><h4>${esc(c.company)}</h4>${chip(c.status)}</header>
      <p class="kind">${esc(c.profile)}</p>
      <p class="muted-text">${esc(c.assets)}</p>
      <dl class="metric"><dt>Объём с начала месяца</dt><dd>${Fmt.t(c.volume_mtd_t)} т <span class="muted-text">из ${Fmt.t(c.plan_mtd_t)}</span> ${pct(v)}</dd></dl>${meter(v)}
      <dl class="metric"><dt>Выручка с начала месяца</dt><dd>${Fmt.n(c.revenue_mtd_mln_kzt)} млн ₸ <span class="muted-text">из ${Fmt.n(c.revenue_plan_mln_kzt)}</span> ${pct(r)}</dd></dl>${meter(r)}
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${open ? `<p class="issues-line bad-text">Открытых проблем: ${open}</p>` : ''}
    </article>`;
  }).join('');
  return section('Компании группы', `<div class="cards">${cards}</div>` + srcNote('companies')) + issuesBlock('Компании', 'Проблемы по компаниям');
}

function renderVolumes() {
  const daily = Calc.daily();
  const below = daily.filter(d => d.fact / d.plan < THRESHOLDS.PLAN_WARN);
  const last = daily[daily.length - 1];
  const desc = `Перевалка по всей сети за ${daily.length} суток с ${Fmt.date(daily[0].date)} по ${Fmt.date(last.date)}. ` +
    `Последние сутки: ${Fmt.t(last.fact)} т при плане ${Fmt.t(last.plan)} т (${Fmt.pct(last.fact / last.plan)}). ` +
    (below.length ? `Ниже 90% плана: ${below.map(d => Fmt.date(d.date)).join(', ')}.` : 'Все сутки не ниже 90% плана.');
  const chart = `<div class="legend"><span><i class="sw bar-own"></i>Факт</span><span><i class="sw plan"></i>План</span><span><i class="sw bar-bad"></i>Ниже 90% плана</span></div>
    <div class="chart" id="chart-network"></div><p class="sr-only">${esc(desc)}</p>`;

  const sites = Calc.sites().map(s => ({ s, v: Calc.byObject(s.object) }));
  const tot = sites.reduce((a, { v }) => ({ plan: a.plan + v.plan, fact: a.fact + v.fact, plan7: a.plan7 + v.plan7, fact7: a.fact7 + v.fact7 }), { plan: 0, fact: 0, plan7: 0, fact7: 0 });
  const tbl = table([
    { h: '№', f: r => r.s.order, num: true },
    { h: 'Объект', f: r => `${stationLink(r.s.object)} <span class="muted-text">${esc(r.s.network === 'Внешняя' ? r.s.country : '')}</span>` },
    { h: 'План за сутки, т', f: r => Fmt.t(r.v.plan), num: true },
    { h: 'Факт за сутки, т', f: r => Fmt.t(r.v.fact), num: true },
    { h: '% плана', f: r => pct(r.v.pct), num: true },
    { h: 'Факт за 7 суток, т', f: r => Fmt.t(r.v.fact7), num: true },
    { h: '% плана за 7 суток', f: r => pct(r.v.pct7), num: true },
  ], sites, { caption: 'Перевалка по объектам', foot: ['', '<b>Итого</b>', Fmt.t(tot.plan), `<b>${Fmt.t(tot.fact)}</b>`, pct(tot.fact / tot.plan), Fmt.t(tot.fact7), pct(tot.fact7 / tot.plan7)] });

  setTimeout(() => barChart($('#chart-network'), {
    data: daily.map(d => ({ date: d.date, plan: d.plan, parts: [{ label: 'Факт', value: d.fact, cls: 'bar-own' }] })),
    desc, highlightBelow: true,
    ariaPoint: (d, t) => `${Fmt.date(d.date)}: факт ${Fmt.t(t)} т, план ${Fmt.t(d.plan)} т, ${Fmt.pct(t / d.plan)}`,
    tooltip: (d, t) => `<b>${Fmt.date(d.date)}</b><br>Факт: ${Fmt.t(t)} т<br>План: ${Fmt.t(d.plan)} т<br>Выполнение: ${pct(t / d.plan)}`,
  }));
  return section('Перевалка за 14 суток, вся сеть', chart + srcNote('throughput', 'station_terminals'))
    + section(`Перевалка по объектам за ${Fmt.date(Calc.lastDate())}`, tbl + `<p class="hint">Перевалка станций равна сумме перевалки всех их терминалов. Нажмите на станцию, чтобы открыть детализацию.</p>` + srcNote('throughput', 'sites'));
}

function siteCard(s, isPort) {
  const v = Calc.byObject(s.object), w = Calc.weather(s.object), wg = Calc.wagonsAt(s.object);
  const fill = s.capacity_t ? s.stock_t / s.capacity_t : NaN;
  const issues = Calc.openIssues({ object: s.object });
  const warns = [];
  if (w && w.alert) warns.push(w.alert);
  if (w && w.gust_ms >= THRESHOLDS.GUST_MS && !(w.alert || '').includes('орыв')) warns.push(`Порывы ветра ${w.gust_ms} м/с`);
  if (isPort && w && w.wave_m >= THRESHOLDS.WAVE_M && !(w.alert || '').includes('олнен')) warns.push(`Волна ${Fmt.n1(w.wave_m)} м`);
  if (fill >= 0.9) warns.push(`Склад заполнен на ${Fmt.pct(fill)}`);
  if (v.pct < THRESHOLDS.PLAN_WARN) warns.push(`Перевалка ${Fmt.pct(v.pct)} плана`);
  const ships = isPort ? Calc.shipsAt(s.object) : null;
  const title = Calc.isStation(s.object) ? stationLink(s.object) : esc(s.object);
  return `<article class="card status-${statusClass(s.status)}">
    <header><h4>${title}</h4>${chip(s.status)}</header>
    <p class="kind">${esc(s.kind)} · ${esc(s.city)}, ${esc(s.country)} · <span class="muted-text">${esc(s.network)} сеть</span></p>
    <div class="stat-row">
      <div><span class="lbl">Перевалка за сутки</span><b>${Fmt.t(v.fact)} т</b> ${pct(v.pct)}</div>
      <div><span class="lbl">Вагоны на объекте</span><b>${wg.total}</b> <span class="${wg.idle ? 'bad' : 'muted'}-text">в простое ${wg.idle}</span></div>
    </div>
    ${ships ? `<div class="stat-row">
      <div><span class="lbl">У причала</span><b>${ships.berth}</b></div>
      <div><span class="lbl">На рейде</span><b class="${ships.roads ? 'warn-text' : ''}">${ships.roads}</b></div>
      <div><span class="lbl">В ремонте</span><b class="${ships.repair ? 'bad-text' : ''}">${ships.repair}</b></div>
    </div>` : ''}
    <dl class="metric"><dt>Остатки / вместимость</dt><dd>${Fmt.t(s.stock_t)} / ${Fmt.t(s.capacity_t)} т · ${Fmt.pct(fill)}</dd></dl>${meter(fill, fillClass(fill))}
    ${w ? `<ul class="weather" aria-label="Погода">
      <li title="Температура">🌡 ${w.temp_c > 0 ? '+' : ''}${w.temp_c}°C</li>
      <li title="Ветер и порывы" class="${w.gust_ms >= THRESHOLDS.GUST_MS ? 'bad-text' : ''}">💨 ${w.wind_ms}, порывы ${w.gust_ms} м/с</li>
      <li title="Осадки">☁ ${esc(w.precip)}</li>
      <li title="Видимость" class="${w.visibility_km < 1 ? 'warn-text' : ''}">👁 ${Fmt.n1(w.visibility_km)} км</li>
      ${isPort && w.wave_m !== '' ? `<li title="Высота волны" class="${w.wave_m >= THRESHOLDS.WAVE_M ? 'bad-text' : ''}">🌊 ${Fmt.n1(w.wave_m)} м</li>` : ''}
    </ul>` : ''}
    ${warns.length ? `<ul class="warns">${warns.map(x => `<li>⚠ ${esc(x)}</li>`).join('')}</ul>` : ''}
    ${issues.length ? `<div class="card-issues"><span class="lbl">Открытые проблемы</span><ul>${issues.map(i => `<li>${chip(i.severity)} ${esc(i.description)}</li>`).join('')}</ul></div>` : ''}
    ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
  </article>`;
}

function renderTerminals() {
  const f = state.termFilter;
  const list = Calc.sites().filter(s => s.section === 'Терминал' && (f === 'all' || (f === 'int' ? s.network === 'Внутренняя' : s.network === 'Внешняя')));
  const seg = [['all', 'Вся сеть'], ['int', 'Внутренняя'], ['ext', 'Внешняя']].map(([k, l]) =>
    `<button type="button" aria-pressed="${f === k}" data-term-filter="${k}">${l}</button>`).join('');
  return section('Терминалы и станции', `<div class="cards">${list.map(s => siteCard(s, false)).join('') || '<p class="empty">Нет объектов</p>'}</div>`
    + srcNote('sites', 'throughput', 'weather', 'wagons'), `<div class="seg" role="group" aria-label="Фильтр по сети">${seg}</div>`)
    + issuesBlock('Терминалы', 'Проблемы по терминалам');
}

function renderPorts() {
  const list = Calc.sites().filter(s => s.section === 'Порт');
  return section('Порты', `<div class="cards">${list.map(s => siteCard(s, true)).join('')}</div>` + srcNote('sites', 'throughput', 'weather', 'ships'))
    + issuesBlock('Порты', 'Проблемы по портам');
}

const SHIP_STATES = [['В рейсе', 'ok'], ['У причала', 'info'], ['На рейде', 'warn'], ['В ремонте', 'bad']];
function renderShips() {
  const ships = Store.rows('ships');
  const dist = distribution(SHIP_STATES.map(([k, cls]) => ({ key: k, cls, n: ships.filter(s => s.status === k).length })), ships.length, 'Суда по состоянию');
  return section(`Флот: ${ships.length} ${Fmt.plural(ships.length, 'судно', 'судна', 'судов')}`, dist + table([
    { h: 'Судно', f: r => `<b>${esc(r.vessel)}</b>` },
    { h: 'Тип', f: r => esc(r.type) },
    { h: 'Линия', f: r => esc(r.route) },
    { h: 'Состояние', f: r => chip(r.status) },
    { h: 'Местоположение', f: r => esc(r.location) },
    { h: 'Груз', f: r => esc(r.cargo) },
    { h: 'Загрузка', f: r => { const x = r.capacity_t ? r.load_t / r.capacity_t : 0; return `${Fmt.pct(x)} ${meter(x, 'info')}`; }, num: true },
    { h: 'Прибытие', f: r => Fmt.dt(r.eta) },
  ], ships, { stack: true, caption: 'Флот' }) + srcNote('ships')) + issuesBlock('Корабли', 'Проблемы флота');
}

function renderPlanes() {
  const flights = [...Store.rows('flights')].sort((a, b) => a.departure < b.departure ? -1 : 1);
  const ref = String(Store.meta('flights').updated).slice(0, 10);
  const days = [...new Set(flights.map(f => String(f.departure).slice(0, 10)))];
  const label = d => d === ref ? 'Сегодня' : (new Date(d) - new Date(ref) === 864e5 ? 'Завтра' : '');
  const cols = [
    { h: 'Рейс', f: r => `<b>${esc(r.flight)}</b>` },
    { h: 'Направление', f: r => esc(r.route) },
    { h: 'Борт', f: r => esc(r.aircraft) },
    { h: 'Статус', f: r => chip(r.status) },
    { h: 'Вылет', f: r => Fmt.time(r.departure) },
    { h: 'Прилёт', f: r => Fmt.time(r.arrival) + (String(r.arrival).slice(0, 10) !== String(r.departure).slice(0, 10) ? ' <sup>+1</sup>' : '') },
    { h: 'Груз', f: r => esc(r.cargo) },
    { h: 'Загрузка', f: r => { const x = r.capacity_t ? r.load_t / r.capacity_t : 0; return `${Fmt.pct(x)} ${meter(x, 'info')}`; }, num: true },
  ];
  return days.map(d => {
    const rows = flights.filter(f => String(f.departure).slice(0, 10) === d);
    return section(`${label(d)} ${label(d) ? '· ' : ''}${Fmt.date(d)} <span class="count">${rows.length} ${Fmt.plural(rows.length, 'рейс', 'рейса', 'рейсов')}</span>`,
      table(cols, rows, { stack: true, caption: 'Рейсы ' + Fmt.date(d) }));
  }).join('') + `<p class="hint">Время местное.</p>` + srcNote('flights') + issuesBlock('Самолёты', 'Проблемы авиаперевозок');
}

const WAGON_STATES = [['В пути', 'ok'], ['На станции', 'info'], ['Под погрузкой', 'info2'], ['Под выгрузкой', 'info3'], ['Простой', 'bad']];
function renderWagons() {
  const all = Store.rows('wagons');
  const dist = distribution(WAGON_STATES.map(([k, cls]) => ({ key: k, cls, n: all.filter(w => w.status === k).length })), all.length, 'Вагоны по состоянию');
  const idle = all.filter(w => w.status === 'Простой');
  const byLoc = Object.entries(idle.reduce((m, w) => (m[w.location] = (m[w.location] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const maxLoc = Math.max(1, ...byLoc.map(x => x[1]));
  const idleHtml = byLoc.length ? `<ul class="hbars">${byLoc.map(([loc, n]) => {
    const avg = idle.filter(w => w.location === loc).reduce((s, w) => s + w.idle_days, 0) / n;
    return `<li><span class="hb-label">${stationLink(loc)}</span><span class="hb-track"><span class="hb-fill" style="width:${n / maxLoc * 100}%"></span></span><b>${n}</b><span class="muted-text">ср. ${Fmt.n1(avg)} сут</span></li>`;
  }).join('')}</ul>` : '<p class="empty">Вагонов в простое нет</p>';

  const f = state.wagonFilter;
  const rows = all.filter(w => f === 'all' || w.status === f).sort((a, b) => b.idle_days - a.idle_days);
  const chips = [['all', 'Все', all.length], ...WAGON_STATES.map(([k]) => [k, k, all.filter(w => w.status === k).length])]
    .map(([k, l, n]) => `<button type="button" aria-pressed="${f === k}" data-wagon-filter="${esc(k)}">${l} <span class="muted-text">${n}</span></button>`).join('');
  return `<div class="grid-2">` + section(`Вагоны по состоянию: ${all.length}`, dist) + section(`Простой по местам: ${idle.length}`, idleHtml) + `</div>`
    + section('Дислокация вагонов', table([
      { h: 'Вагон', f: r => `<b>${esc(r.wagon)}</b>` },
      { h: 'Тип', f: r => esc(r.type) },
      { h: 'Груз', f: r => esc(r.cargo) },
      { h: 'Состояние', f: r => chip(r.status) },
      { h: 'Где сейчас', f: r => stationLink(r.location) },
      { h: 'Назначение', f: r => esc(r.destination) },
      { h: 'Простой, сут', f: r => r.idle_days ? Fmt.n1(r.idle_days) : '—', num: true, cls: r => r.idle_days >= THRESHOLDS.IDLE_DAYS ? 'over' : '' },
      { h: 'Прибытие', f: r => Fmt.date(r.eta) },
    ], rows, { stack: true, caption: 'Дислокация вагонов' }) + `<p class="hint">Простой от ${THRESHOLDS.IDLE_DAYS} суток выделен красным.</p>` + srcNote('wagons'),
    `<div class="seg wrap" role="group" aria-label="Фильтр по состоянию">${chips}</div>`)
    + issuesBlock('Вагоны', 'Проблемы с вагонами');
}

const TOPICS = ['Ж/д и транзит', 'Порты и море', 'Сырьё и рынки', 'Регуляторика'];
function renderDigest() {
  const all = [...Store.rows('digest')].sort((a, b) => a.date < b.date ? 1 : -1);
  const t = state.digestTopic;
  const rows = all.filter(r => t === 'all' || r.topic === t);
  const chips = [['all', 'Все темы'], ...TOPICS.map(x => [x, x])].map(([k, l]) =>
    `<button type="button" aria-pressed="${t === k}" data-digest-topic="${esc(k)}">${l} <span class="muted-text">${k === 'all' ? all.length : all.filter(r => r.topic === k).length}</span></button>`).join('');
  const demo = Store.meta('digest').status === 'Демо'
    ? `<p class="banner">Сейчас в дайджесте заглушки для проверки макета. Замените набор <code>digest</code> реальными публикациями: заголовок, ссылка на статью, пересказ своими словами.</p>` : '';
  const items = rows.map(r => `<article class="news">
      <div class="news-meta"><time datetime="${esc(r.date)}">${Fmt.date(r.date)}</time><span class="chip neutral">${esc(r.topic)}</span><span class="muted-text">${esc(r.source)}</span></div>
      <h4><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.headline)}</a></h4>
      <p>${esc(r.summary)}</p></article>`).join('') || '<p class="empty">Нет публикаций по теме</p>';
  return section('Отраслевой дайджест', demo + items + srcNote('digest'), `<div class="seg wrap" role="group" aria-label="Фильтр по теме">${chips}</div>`);
}

// ---------- Страница станции ----------
function renderStation(name) {
  const tot = Calc.stationTotals(name), daily = Calc.stationDaily(name), terms = Calc.stationTerminals(name);
  if (!daily.length) return `<p class="empty">Нет данных по станции ${esc(name)}</p>`;
  const back = TABS.find(t => t.id === state.returnTab) || TABS[2];
  const card = (label, value, sub, cls = 'neutral') => `<div class="kpi ${cls}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;
  const kpis = `<div class="kpis kpis-4">
    ${card('Перевалено всеми терминалами за сутки, т', Fmt.t(tot.fact), isFinite(tot.change) ? `<span class="${tot.change >= 0 ? 'ok' : 'bad'}-text">${Fmt.delta(tot.change)}</span> к пред. суткам` : '—')}
    ${card('Выполнение плана станции', `<span class="${planClass(tot.pct)}-text">${Fmt.pct(tot.pct)}</span>`, `план ${Fmt.t(tot.plan)} т`, planClass(tot.pct))}
    ${card('Терминалы нашей компании, т', Fmt.t(tot.own), `доля ${Fmt.pct(tot.ownShare)}`)}
    ${card('Сторонние терминалы, т', Fmt.t(tot.ext), `доля ${Fmt.pct(tot.extShare)}`)}
  </div>`;
  const last = daily[daily.length - 1];
  const desc = `Перевалка станции ${name} за ${daily.length} суток, наши и сторонние терминалы. Последние сутки ${Fmt.date(last.date)}: всего ${Fmt.t(last.fact)} т, наши ${Fmt.t(last.own)} т, сторонние ${Fmt.t(last.ext)} т, план ${Fmt.t(last.plan)} т.`;
  setTimeout(() => barChart($('#chart-station'), {
    data: daily.map(d => ({ date: d.date, plan: d.plan, parts: [{ label: 'Наши', value: d.own, cls: 'bar-own' }, { label: 'Сторонние', value: d.ext, cls: 'bar-ext' }] })),
    desc,
    ariaPoint: (d, t) => `${Fmt.date(d.date)}: всего ${Fmt.t(t)} т, наши ${Fmt.t(d.parts[0].value)} т, сторонние ${Fmt.t(d.parts[1].value)} т, план ${Fmt.t(d.plan)} т`,
    tooltip: (d, t) => `<b>${Fmt.date(d.date)}</b><br>Всего: ${Fmt.t(t)} т (${pct(t / d.plan)} плана)<br><i class="sw bar-own"></i> Наши: ${Fmt.t(d.parts[0].value)} т<br><i class="sw bar-ext"></i> Сторонние: ${Fmt.t(d.parts[1].value)} т<br>План: ${Fmt.t(d.plan)} т`,
  }));
  const sum = terms.reduce((a, r) => ({ plan: a.plan + r.plan, fact: a.fact + r.fact, fact7: a.fact7 + r.fact7 }), { plan: 0, fact: 0, fact7: 0 });
  const conditional = terms.some(t => /усл\./.test(t.terminal))
    ? `<p class="banner">Список терминалов станции условный: реальный перечень и принадлежность ждём от заказчика.</p>` : '';
  return `<div class="station-head"><button type="button" class="back" data-back>← Назад <span class="muted-text">к разделу «${back.title}»</span></button>
      <h2>${esc(name)}</h2><p class="muted-text">Совокупная перевалка всех терминалов станции за ${Fmt.date(last.date)}: нашей компании и сторонних операторов</p></div>`
    + conditional + kpis
    + section('Перевалка станции за 14 суток', `<div class="legend"><span><i class="sw bar-own"></i>Терминалы нашей компании</span><span><i class="sw bar-ext"></i>Сторонние терминалы</span><span><i class="sw plan"></i>План станции</span></div>
      <div class="chart" id="chart-station"></div><p class="sr-only">${esc(desc)}</p>` + srcNote('station_terminals'))
    + section('Терминалы станции', table([
      { h: 'Терминал', f: r => `<b>${esc(r.terminal)}</b>` },
      { h: 'Владелец', f: r => `<span class="chip ${r.owner === 'Наша компания' ? 'info' : 'neutral'}">${esc(r.owner)}</span>` },
      { h: 'Грузы', f: r => esc(r.cargo) },
      { h: 'План за сутки, т', f: r => Fmt.t(r.plan), num: true },
      { h: 'Факт за сутки, т', f: r => Fmt.t(r.fact), num: true },
      { h: '% плана', f: r => pct(r.pct), num: true },
      { h: 'Доля в станции', f: r => Fmt.pct(r.share), num: true },
      { h: 'Факт за 7 суток, т', f: r => Fmt.t(r.fact7), num: true },
    ], terms, { caption: 'Терминалы станции ' + name, foot: ['<b>Итого по станции</b>', '', '', Fmt.t(sum.plan), `<b>${Fmt.t(sum.fact)}</b>`, pct(sum.fact / sum.plan), '100%', Fmt.t(sum.fact7)] })
      + srcNote('station_terminals'));
}

// ---------- Блок «О данных и показателях» ----------
function renderAbout() {
  const formulas = [
    ['Перевалка за сутки', 'Сумма факта всех объектов за последние сутки; изменение к предыдущим суткам, %'],
    ['Выполнение плана', 'Факт / план за сутки, %'],
    ['Перевалка станции', 'Сумма перевалки всех терминалов станции (наших и сторонних)'],
    ['Перевалка по объектам', 'Последние сутки и 7 суток по объекту; порядок по полю order справочника'],
    ['Маршруты, компании', 'Объём (выручка) с начала месяца / план'],
    ['Загрузка судов и рейсов', 'load_t / capacity_t'],
    ['Суда в портах', 'Число у причала, на рейде, в ремонте по полю location'],
    ['Вагоны', 'Количество по состоянию; в простое — со статусом «Простой»'],
    ['Цвет выполнения плана', `зелёный — от 100%; жёлтый — 90–100%; красный — ниже ${THRESHOLDS.PLAN_WARN * 100}%`],
    ['Прочие пороги', `простой вагона от ${THRESHOLDS.IDLE_DAYS} суток, волна от ${Fmt.n1(THRESHOLDS.WAVE_M)} м, порывы от ${THRESHOLDS.GUST_MS} м/с`],
  ];
  const sets = DATASET_ORDER.map(n => Store.meta(n)).filter(Boolean);
  return `<h3>Как считаются показатели</h3>
    ${table([{ h: 'Показатель', f: r => `<b>${r[0]}</b>` }, { h: 'Расчёт', f: r => esc(r[1]) }], formulas, { stack: true })}
    <h3>Источники данных</h3>
    <p class="hint">Любой набор можно скачать в CSV и заменить своим файлом с теми же колонками (разделитель — запятая или точка с запятой, кодировка UTF-8). Загруженный файл хранится в этом браузере.</p>
    ${table([
      { h: 'Набор', f: m => `<b>${esc(m.title)}</b><br><code>${m.name}</code>` },
      { h: 'Источник', f: m => esc(m.source) + `<br><span class="muted-text">${esc(m.origin)}</span>` },
      { h: 'Статус', f: m => `<span class="tag ${m.overridden ? 'ok' : 'neutral'}">${esc(m.status)}</span>` },
      { h: 'Обновлено', f: m => Fmt.dt(m.updated) },
      { h: 'Строк', f: m => m.rows.length, num: true },
      { h: 'Действия', f: m => `<div class="actions"><button type="button" class="btn" data-dl="${m.name}">Скачать CSV</button>
        <label class="btn">Заменить файлом<input type="file" accept=".csv,text/csv" data-upload="${m.name}" hidden></label>
        ${m.overridden ? `<button type="button" class="btn ghost" data-reset="${m.name}">Вернуть встроенные</button>` : ''}</div>` },
    ], sets, { stack: true, caption: 'Источники данных' })}
    <p class="hint">Все операционные цифры в прототипе — демо-данные для проверки макета. Названия терминалов станции Достык настоящие, объёмы по ним — нет.</p>`;
}

// ---------- Навигация и события ----------
function render() {
  renderTabs();
  const view = $('#view');
  if (state.station) {
    view.innerHTML = renderStation(state.station);
    view.setAttribute('aria-label', state.station);
    document.title = state.station + ' — Оперативный дашборд';
  } else {
    const t = TABS.find(x => x.id === state.tab) || TABS[0];
    state.tab = t.id;
    view.innerHTML = t.render();
    view.setAttribute('aria-labelledby', 'tab-' + t.id);
    document.title = 'Оперативный дашборд: активы и логистика';
  }
}

function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('station/')) {
    const name = h.slice(8);
    if (!state.station) state.returnTab = state.tab;
    state.station = name;
  } else {
    state.station = null;
    if (TABS.some(t => t.id === h)) state.tab = h;
  }
  saveUI();
  render();
  const top = $('#tabs').offsetTop;
  if (window.scrollY > top) window.scrollTo({ top });
}

function download(name) {
  const blob = new Blob(['﻿' + Store.csv(name)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-tab],[data-station],[data-back],[data-dl],[data-reset],[data-term-filter],[data-wagon-filter],[data-digest-topic]');
  if (!el) return;
  const d = el.dataset;
  if (d.tab) { e.preventDefault(); go('#' + d.tab); if (el.classList.contains('kpi')) $('#tabs').scrollIntoView({ behavior: 'smooth' }); }
  else if (d.station) { e.preventDefault(); state.returnTab = state.station ? state.returnTab : state.tab; go('#station/' + encodeURIComponent(d.station)); }
  else if ('back' in d) { go('#' + state.returnTab); }
  else if (d.dl) download(d.dl);
  else if (d.reset) { Store.reset(d.reset); location.reload(); }
  else if (d.termFilter) { state.termFilter = d.termFilter; saveUI(); render(); }
  else if (d.wagonFilter) { state.wagonFilter = d.wagonFilter; saveUI(); render(); }
  else if (d.digestTopic) { state.digestTopic = d.digestTopic; saveUI(); render(); }
});

document.addEventListener('change', e => {
  const name = e.target.dataset && e.target.dataset.upload;
  if (!name || !e.target.files[0]) return;
  const file = e.target.files[0], reader = new FileReader();
  reader.onload = () => {
    try { Store.override(name, reader.result, file.name); location.reload(); }
    catch (err) { alert('Не удалось загрузить файл: ' + err.message); }
  };
  reader.readAsText(file, 'utf-8');
});

// Стрелки влево/вправо по вкладкам
document.addEventListener('keydown', e => {
  if (!e.target.closest('#tabs') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const i = TABS.findIndex(t => t.id === state.tab);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
  go('#' + TABS[n].id);
  setTimeout(() => $('#tab-' + TABS[n].id).focus());
  e.preventDefault();
});

window.addEventListener('hashchange', route);

// ---------- Запуск ----------
Store.load();
renderHeader();
$('#about-body').innerHTML = renderAbout();
if (!location.hash) history.replaceState(null, '', '#' + state.tab);
route();
