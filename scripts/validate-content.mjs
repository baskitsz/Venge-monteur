// Controleert de onderhoudsdata in content/.
// 1. Elke stap, waarde, waarschuwing, interval, gereedschap en onderdeelnummer heeft een bron
//    (handleiding + pagina), of is expliciet gemarkeerd als eigen aanvulling (origin: "own").
// 2. Eigen aanvullingen bevatten geen getallen (we verzinnen geen waarden).
// 3. Als de PDF's in manuals/ staan en pdftotext beschikbaar is: elke getalwaarde
//    (aandraaimoment, spec) moet letterlijk op de genoemde pagina voorkomen.
//
// Gebruik: node scripts/validate-content.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { manuals } = JSON.parse(readFileSync(join(root, 'content/manuals.json'), 'utf8'));
const byId = Object.fromEntries(manuals.map((m) => [m.id, m]));

const errors = [];
const warnings = [];
const pageCache = new Map();
let pdfCheck = true;
let pdfPagesChecked = 0;

function pageText(manual, page) {
  const key = `${manual.id}:${page}`;
  if (pageCache.has(key)) return pageCache.get(key);
  const file = join(root, 'manuals', manual.file);
  let text = null;
  if (pdfCheck && existsSync(file)) {
    try {
      text = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), file, '-'], { encoding: 'utf8' });
      pdfPagesChecked++;
    } catch {
      pdfCheck = false;
      warnings.push('pdftotext niet beschikbaar: getalwaarden niet tegen de PDF gecontroleerd.');
    }
  }
  pageCache.set(key, text);
  return text;
}

function checkSource(where, item, { own = false } = {}) {
  const src = item.source;
  if (src == null) {
    if (!own && item.origin !== 'own') errors.push(`${where}: geen bron en niet gemarkeerd als eigen aanvulling`);
    if (/\d/.test(item.text ?? item.value ?? '')) errors.push(`${where}: eigen aanvulling bevat een getal`);
    return null;
  }
  const m = byId[src.manual];
  if (!m) return errors.push(`${where}: onbekende handleiding '${src.manual}'`), null;
  if (m.use !== 'bron') errors.push(`${where}: '${m.id}' mag niet als bron worden gebruikt (${m.use})`);
  if (!Number.isInteger(src.page) || src.page < 1 || src.page > m.pages)
    errors.push(`${where}: pagina ${src.page} bestaat niet in ${m.file}`);
  return m;
}

function numberOnPage(where, m, page, num) {
  const text = pageText(m, page);
  if (text == null) return;
  const variants = numVariants(num);
  if (!variants.some((v) => text.includes(v))) errors.push(`${where}: waarde ${num} niet gevonden op ${m.file} p.${page}`);
}

// Engelse (13.5) en Nederlandse (13,5) notatie
function numVariants(num) {
  const v = [String(num), num.toFixed(1)];
  return [...v, ...v.map((x) => x.replace('.', ','))];
}

function rangeOnPage(where, m, page, min, max) {
  const text = pageText(m, page);
  if (text == null) return;
  const flat = text.replace(/\s+/g, ' ');
  const ok = numVariants(min).some((a) => numVariants(max).some((b) => flat.includes(`${a} - ${b}`) || flat.includes(`${a}-${b}`)));
  if (!ok) errors.push(`${where}: bereik ${min}-${max} niet gevonden op ${m.file} p.${page}`);
}

const partsDir = join(root, 'content/parts');
const ids = new Set();
for (const f of readdirSync(partsDir).filter((f) => f.endsWith('.json')).sort()) {
  const p = JSON.parse(readFileSync(join(partsDir, f), 'utf8'));
  const w = (s) => `${f} › ${s}`;
  if (`${p.id}.json` !== f) errors.push(w(`id '${p.id}' komt niet overeen met bestandsnaam`));
  if (ids.has(p.id)) errors.push(w('dubbele id'));
  ids.add(p.id);
  for (const k of ['name', 'group', 'coverage', 'tasks', 'warnings', 'notFound', 'neededManuals'])
    if (!(k in p)) errors.push(w(`veld '${k}' ontbreekt`));

  (p.tools ?? []).forEach((t, i) => checkSource(w(`tools[${i}]`), t));
  (p.intervals ?? []).forEach((t, i) => checkSource(w(`intervals[${i}]`), t));
  (p.warnings ?? []).forEach((t, i) => checkSource(w(`warnings[${i}]`), t));
  (p.parts ?? []).forEach((t, i) => {
    const m = checkSource(w(`parts[${i}]`), t);
    if (m && pageText(m, t.source.page) != null && !pageText(m, t.source.page).includes(t.partNo))
      errors.push(w(`onderdeelnummer ${t.partNo} niet gevonden op p.${t.source.page}`));
  });
  (p.torques ?? []).forEach((t, i) => {
    const m = checkSource(w(`torques[${i}]`), t);
    const range = typeof t.nmMin === 'number' && typeof t.nmMax === 'number';
    if (typeof t.nm !== 'number' && !range) errors.push(w(`torques[${i}]: geef 'nm' of 'nmMin' + 'nmMax' op`));
    if (m && range) rangeOnPage(w(`torques[${i}] Nm`), m, t.source.page, t.nmMin, t.nmMax);
    else if (m) {
      numberOnPage(w(`torques[${i}] Nm`), m, t.source.page, t.nm);
      if (t.inlbf != null) numberOnPage(w(`torques[${i}] in-lbf`), m, t.source.page, t.inlbf);
    }
  });
  (p.specs ?? []).forEach((t, i) => {
    const m = checkSource(w(`specs[${i}]`), t);
    if (!m) return;
    for (const n of t.value.match(/\d+(?:[.,]\d+)?/g) ?? [])
      numberOnPage(w(`specs[${i}]`), m, t.source.page, Number(n.replace(',', '.')));
  });
  (p.tasks ?? []).forEach((task, i) => {
    if (!['manual', 'own'].includes(task.origin)) errors.push(w(`tasks[${i}]: origin moet 'manual' of 'own' zijn`));
    task.steps.forEach((s, j) => {
      const where = w(`tasks[${i}].steps[${j}]`);
      if (task.origin === 'own') {
        if (s.source) errors.push(`${where}: eigen aanvulling hoort geen fabrieksbron te hebben`);
        checkSource(where, s, { own: true });
      } else {
        const m = checkSource(where, s);
        if (m) for (const n of s.text.match(/\d+(?:,\d+)?(?= ?(?:Nm|mm))/g) ?? [])
          numberOnPage(where, m, s.source.page, Number(n.replace(',', '.')));
      }
    });
  });
}

for (const x of warnings) console.warn('⚠️ ', x);
if (errors.length) {
  for (const e of errors) console.error('✗', e);
  console.error(`\n${errors.length} fout(en) in ${ids.size} onderdelen.`);
  process.exit(1);
}
console.log(
  pdfPagesChecked
    ? `✓ ${ids.size} onderdelen gecontroleerd; bronnen kloppen en alle waarden staan op de genoemde PDF-pagina's (${pdfPagesChecked} pagina's gecontroleerd).`
    : `✓ ${ids.size} onderdelen gecontroleerd; bronnen kloppen. PDF's niet aanwezig, waarden niet tegen de PDF's gecontroleerd.`,
);
