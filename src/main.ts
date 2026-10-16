import './styles.css';
import { BikeViewer, type HoverDetail } from './viewer';
import type { PartId } from './bike/model';
import { partById, parts } from './content';
import { prefs, resetTask, setDone, stepKey } from './progress';
import { LocalFileSource, statusFor, type PartStatus, type UsageData, type UsageSource } from './usage';
import { DISCLAIMER, renderOverview, renderPart } from './ui/panel';
import { esc, icon } from './ui/format';
import { highlight, search } from './ui/search';

// Op het model alleen kleuren wat aandacht vraagt; 'in orde' staat als groene stip in de lijst.
const STATUS_COLOR: Record<string, string | null> = { ok: null, soon: '#e0a100', due: '#d64545', unknown: null };

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" data-home aria-label="Venge-onderhoud, naar overzicht">${icon.bike}<span><strong>Venge-onderhoud</strong><small>Specialized Venge Pro 2019</small></span></a>
    <div class="search" role="search">
      ${icon.search}
      <input id="q" type="search" placeholder="Zoek onderdeel, taak of waarde…" autocomplete="off" aria-label="Zoeken" aria-controls="results" />
      <ul id="results" class="results" role="listbox" hidden></ul>
    </div>
    <div class="actions">
      <button class="icon-btn" id="status-btn" type="button" aria-pressed="false" title="Statuskleuren op het model">${icon.status}</button>
      <button class="icon-btn" id="home-btn" type="button" title="Hele fiets tonen" aria-label="Hele fiets tonen">${icon.home}</button>
      <button class="icon-btn" id="theme-btn" type="button"></button>
    </div>
  </header>
  <main id="stage" aria-label="3D-model">
    <div class="hover-label" id="label" aria-hidden="true"></div>
    <p class="stage-hint">Sleep om te draaien · klik op een onderdeel</p>
  </main>
  <aside id="panel" class="sheet" aria-label="Onderhoudsinformatie">
    <button class="sheet-handle" id="sheet-handle" type="button" aria-label="Paneel groter of kleiner maken"><span></span></button>
    <div id="panel-body" tabindex="-1"></div>
  </aside>
  <div class="banner" id="banner" role="dialog" aria-labelledby="banner-title" hidden>
    ${icon.warning}
    <div><strong id="banner-title">Hulpmiddel, geen vervanging van de handleiding</strong><p>${esc(DISCLAIMER)}</p></div>
    <button type="button" class="btn" id="banner-ok">Begrepen</button>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const label = $('label');
const body = $('panel-body');
const panel = $('panel');
const q = $<HTMLInputElement>('q');
const results = $('results');

// ---------- thema ----------
type Theme = 'auto' | 'light' | 'dark';
let theme = (prefs.get('theme') as Theme) || 'auto';
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const b = $('theme-btn');
  const next = { auto: 'licht', light: 'donker', dark: 'automatisch' }[theme];
  b.innerHTML = { auto: icon.auto, light: icon.sun, dark: icon.moon }[theme];
  b.title = `Thema: ${{ auto: 'automatisch', light: 'licht', dark: 'donker' }[theme]} (klik voor ${next})`;
  b.setAttribute('aria-label', b.title);
  viewer?.setAccent(accent());
}
$('theme-btn').onclick = () => {
  theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  prefs.set('theme', theme);
  applyTheme();
};
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => viewer?.setAccent(accent()));

// ---------- 3D ----------
const viewer = new BikeViewer(stage);
applyTheme();

viewer.addEventListener('hover', (e) => {
  const { id, x, y } = (e as CustomEvent<HoverDetail>).detail;
  label.textContent = id ? partById.get(id)?.name ?? id : '';
  label.classList.toggle('show', !!id);
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
});

// ---------- gebruiksdata en status ----------
const usageSource: UsageSource = new LocalFileSource();
let usage: UsageData = { source: '', updated: null, bikeKm: null, parts: {} };
const statuses = new Map<string, PartStatus>();
let statusMode = prefs.get('statusMode') !== 'off';

function computeStatuses() {
  for (const p of parts) statuses.set(p.id, statusFor(usage.parts[p.id], usage.bikeKm));
}
function applyStatusMode() {
  $('status-btn').setAttribute('aria-pressed', String(statusMode));
  $('status-btn').setAttribute('aria-label', `Statuskleuren ${statusMode ? 'uit' : 'aan'}zetten`);
  const tints = new Map<PartId, string | null>();
  for (const [id, s] of statuses) tints.set(id as PartId, statusMode ? STATUS_COLOR[s.level] : null);
  viewer.setTints(tints);
}
$('status-btn').onclick = () => {
  statusMode = !statusMode;
  prefs.set('statusMode', statusMode ? 'on' : 'off');
  applyStatusMode();
  const any = [...statuses.values()].some((s) => s.level !== 'unknown');
  toast(statusMode ? (any ? 'Statuskleuren aan' : 'Statuskleuren aan, maar er is nog geen kilometerdata ingevuld') : 'Statuskleuren uit');
};

// ---------- paneel ----------
let current: PartId | null = null;

function render(openTask?: string) {
  const p = current ? partById.get(current) : null;
  body.innerHTML = p ? renderPart(p, statuses.get(p.id)!, usage, openTask) : renderOverview(statuses, usage, usageSource.name);
  body.scrollTop = 0;
  panel.dataset.mode = p ? 'detail' : 'overview';
}

function select(id: PartId | null, opts: { openTask?: string; step?: string; section?: string; fromViewer?: boolean; push?: boolean } = {}) {
  current = id && partById.has(id) ? id : null;
  render(opts.openTask);
  if (!opts.fromViewer) viewer.select(current, true);
  if (!current) viewer.home();
  if (opts.push !== false) {
    const hash = current ? `#/${current}` : '#/';
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
  if (current && isMobile() && panel.dataset.size === 'min') setSheet('half');
  const target = opts.step
    ? body.querySelector<HTMLElement>(`[data-step="${CSS.escape(opts.step)}"]`)
    : opts.section
      ? body.querySelector<HTMLElement>(`[data-section="${CSS.escape(opts.section)}"]`)
      : null;
  if (target) {
    target.scrollIntoView({ block: opts.step ? 'center' : 'start', behavior: 'smooth' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1800);
  }
}

viewer.addEventListener('select', (e) => {
  const id = (e as CustomEvent<PartId | null>).detail;
  if (id !== current) select(id, { fromViewer: true });
});

body.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const sel = t.closest<HTMLElement>('[data-select]');
  if (sel) return select(sel.dataset.select as PartId);
  if (t.closest('[data-close]')) return select(null);
  const reset = t.closest<HTMLElement>('[data-reset]');
  if (reset && current) {
    const task = partById.get(current)!.tasks.find((x) => x.id === reset.dataset.reset)!;
    resetTask(task.steps.map((s) => stepKey(task.id, s.text)));
    render(task.id);
  }
});
body.addEventListener('change', (e) => {
  const cb = e.target as HTMLInputElement;
  if (!cb.dataset.key) return;
  setDone(cb.dataset.key, cb.checked);
  const det = cb.closest('details')!;
  const boxes = [...det.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const done = boxes.filter((b) => b.checked).length;
  const c = det.querySelector<HTMLElement>('[data-count]')!;
  c.textContent = `${done}/${boxes.length}`;
  c.classList.toggle('complete', done === boxes.length);
});

document.querySelector('[data-home]')!.addEventListener('click', (e) => {
  e.preventDefault();
  select(null);
});
$('home-btn').onclick = () => (current ? select(null) : viewer.home());
window.addEventListener('popstate', () => select((location.hash.replace(/^#\/?/, '') || null) as PartId | null, { push: false }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement !== q && current) select(null);
  if (e.key === '/' && document.activeElement !== q) {
    e.preventDefault();
    q.focus();
  }
});

// ---------- zoeken ----------
let active = -1;
function showResults() {
  const hits = search(q.value);
  active = -1;
  if (!q.value.trim()) {
    results.hidden = true;
    return;
  }
  results.hidden = false;
  results.innerHTML = hits.length
    ? hits
        .map(
          (h, i) => `<li role="option" id="r${i}" data-i="${i}"><button type="button" tabindex="-1">
            <span class="r-part">${esc(h.partName)} <em>${esc(h.kind)}</em></span>
            <span class="r-text">${highlight(h.text, q.value)}</span></button></li>`,
        )
        .join('')
    : `<li class="none">Niets gevonden voor “${esc(q.value)}”.</li>`;
  results.querySelectorAll<HTMLElement>('li[data-i]').forEach((li) => {
    li.onmousedown = (ev) => ev.preventDefault();
    li.onclick = () => pick(hits[+li.dataset.i!]);
  });
  (results as unknown as { hits: typeof hits }).hits = hits;
}
function pick(h: ReturnType<typeof search>[number]) {
  results.hidden = true;
  q.blur();
  select(h.partId as PartId, { openTask: h.taskId, step: h.stepKey, section: h.section });
}
q.addEventListener('input', showResults);
q.addEventListener('focus', showResults);
q.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 120));
q.addEventListener('keydown', (e) => {
  const hits = (results as unknown as { hits?: ReturnType<typeof search> }).hits ?? [];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = Math.max(0, Math.min(hits.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
    results.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === active));
    q.setAttribute('aria-activedescendant', `r${active}`);
  } else if (e.key === 'Enter' && hits.length) {
    pick(hits[Math.max(active, 0)]);
  } else if (e.key === 'Escape') {
    q.value = '';
    results.hidden = true;
    q.blur();
  }
});

// ---------- mobiel paneel ----------
const isMobile = () => window.matchMedia('(max-width: 859px)').matches;
const setPlaceholder = () => (q.placeholder = isMobile() ? 'Zoeken…' : 'Zoek onderdeel, taak of waarde…');
setPlaceholder();
window.matchMedia('(max-width: 859px)').addEventListener('change', setPlaceholder);
function setSheet(size: 'min' | 'half' | 'full') {
  panel.dataset.size = size;
}
setSheet('half');
$('sheet-handle').onclick = () => setSheet(panel.dataset.size === 'full' ? 'half' : 'full');

// ---------- disclaimer en melding ----------
if (prefs.get('disclaimer') !== 'ok') $('banner').hidden = false;
$('banner-ok').onclick = () => {
  $('banner').hidden = true;
  prefs.set('disclaimer', 'ok');
};
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- start ----------
usageSource.load().then((u) => {
  usage = u;
  computeStatuses();
  applyStatusMode();
  const initial = location.hash.replace(/^#\/?/, '') as PartId;
  select(partById.has(initial) ? initial : null, { push: false });
});

// voor testen in de console
(window as unknown as { venge: unknown }).venge = { viewer, select };
