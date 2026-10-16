// Rendert het onderhoudspaneel (overzicht en detail per onderdeel) als HTML.
import { GROUP_ORDER, manuals, parts, type Part, type Warning } from '../content';
import { isDone, stepKey } from '../progress';
import type { PartStatus, PartUsage, UsageData } from '../usage';
import { esc, icon, num, sourceChip, torqueValue } from './format';

const COVERAGE: Record<Part['coverage'], string> = {
  goed: 'Goed gedekt',
  deels: 'Deels gedekt',
  geen: 'Weinig in handleidingen',
};

export const DISCLAIMER =
  'Deze instructies zijn een hulpmiddel, samengevat uit de handleidingen van de fabrikanten. Ze vervangen de officiële handleiding niet. ' +
  'Twijfel je, raadpleeg dan de originele handleiding of laat het werk doen door een fietsenmaker, zeker bij carbon onderdelen en remmen.';

const CAUTION_TEXT = {
  carbon: 'Carbon onderdeel. Gebruik altijd een momentsleutel en houd je aan de aandraaimomenten. Bij twijfel of na een val: laat het nakijken door een fietsenmaker.',
  remmen: 'Remmen zijn veiligheidskritisch. Twijfel je over een stap, laat het werk dan doen door een fietsenmaker en test de remmen altijd voordat je gaat rijden.',
};

function statusPill(s: PartStatus) {
  return `<span class="status s-${s.level}" title="${esc(s.detail)}"><i></i>${esc(s.label)}</span>`;
}

function warningsBlock(ws: Warning[]) {
  if (!ws.length) return '';
  return `<section class="block warnings" data-section="warnings" aria-label="Waarschuwingen">
    <h3>Let op</h3>
    <ul>${ws
      .map(
        (w) => `<li class="w-${w.level}">${w.level === 'info' ? icon.info : icon.warning}<div><p>${esc(w.text)}</p>${sourceChip(w.source)}</div></li>`,
      )
      .join('')}</ul></section>`;
}

function tasksBlock(p: Part, openTask?: string) {
  if (!p.tasks.length) return `<section class="block"><h3>Taken</h3><p class="empty">Niet gevonden in handleiding.</p></section>`;
  return `<section class="block"><h3>Taken</h3>${p.tasks
    .map((t, ti) => {
      const keys = t.steps.map((s) => stepKey(t.id, s.text));
      const done = keys.filter(isDone).length;
      const open = openTask ? openTask === t.id : ti === 0;
      return `<details class="task${t.origin === 'own' ? ' own' : ''}" data-task="${esc(t.id)}"${open ? ' open' : ''}>
        <summary><span class="t-title">${esc(t.title)}</span>
          ${t.origin === 'own' ? '<span class="tag own">Eigen aanvulling</span>' : ''}
          <span class="count${done === keys.length ? ' complete' : ''}" data-count>${done}/${keys.length}</span></summary>
        ${t.origin === 'own' ? '<p class="own-note">Algemene werkwijze, geen fabrieksinstructie. Bevat bewust geen getalwaarden.</p>' : ''}
        <ol class="steps">${t.steps
          .map((s, i) => {
            const k = keys[i];
            return `<li data-step="${esc(k)}"><label><input type="checkbox" data-key="${esc(k)}"${isDone(k) ? ' checked' : ''}>
              <span class="n">${i + 1}</span><span class="txt">${esc(s.text)}</span></label>${sourceChip(s.source)}</li>`;
          })
          .join('')}</ol>
        <button class="link reset" data-reset="${esc(t.id)}" type="button">Vinkjes wissen</button>
      </details>`;
    })
    .join('')}</section>`;
}

function torquesBlock(p: Part) {
  if (!p.torques.length) return '';
  return `<section class="block" data-section="torques"><h3>Aandraaimomenten</h3><div class="table" role="table">
    ${p.torques
      .map(
        (t) => `<div class="row" role="row"><div role="cell"><strong>${esc(t.location)}</strong>${t.tool ? `<span class="sub">${esc(t.tool)}</span>` : ''}${t.note ? `<span class="note">${esc(t.note)}</span>` : ''}${sourceChip(t.source)}</div>
        <div role="cell" class="val">${torqueValue(t)}${t.inlbf != null ? `<span class="sub">${num(t.inlbf)} in-lbf</span>` : ''}</div></div>`,
      )
      .join('')}</div></section>`;
}

function specsBlock(p: Part) {
  if (!p.specs?.length) return '';
  return `<section class="block" data-section="specs"><h3>Specificaties</h3><div class="table">${p.specs
    .map((s) => `<div class="row"><div><strong>${esc(s.label)}</strong>${sourceChip(s.source)}</div><div class="val small">${esc(s.value)}</div></div>`)
    .join('')}</div></section>`;
}

function intervalsBlock(p: Part, u: PartUsage | undefined) {
  const own =
    u && (u.intervalKm || u.intervalMonths)
      ? `<li class="mine"><strong>Jouw interval</strong><span>${[u.intervalKm ? `${num(u.intervalKm)} km` : '', u.intervalMonths ? `${u.intervalMonths} maanden` : ''].filter(Boolean).join(' of ')}</span><span class="src own">Eigen keuze</span></li>`
      : '';
  if (!p.intervals.length && !own) return '';
  return `<section class="block"><h3>Wanneer</h3><ul class="intervals">${p.intervals
    .map((i) => `<li><strong>${esc(i.label)}</strong><span>${esc(i.when)}</span>${sourceChip(i.source)}</li>`)
    .join('')}${own}</ul></section>`;
}

function toolsBlock(p: Part) {
  if (!p.tools.length) return '';
  return `<section class="block" data-section="tools"><h3>Gereedschap</h3><ul class="tools">${p.tools
    .map((t) => `<li><span>${esc(t.label)}</span>${sourceChip(t.source)}</li>`)
    .join('')}</ul></section>`;
}

function partNosBlock(p: Part) {
  if (!p.parts?.length) return '';
  return `<section class="block"><h3>Onderdeelnummers</h3><ul class="tools">${p.parts
    .map((t) => `<li><span><code>${esc(t.partNo)}</code> ${esc(t.label)}</span>${sourceChip(t.source)}</li>`)
    .join('')}</ul></section>`;
}

function gapsBlock(p: Part) {
  if (!p.notFound.length && !p.neededManuals.length) return '';
  return `<section class="block gaps"><h3>Niet gevonden in handleiding</h3>
    ${p.notFound.length ? `<ul>${p.notFound.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${p.neededManuals.length ? `<p class="sub">Nog aan te leveren:</p><ul class="needed">${p.neededManuals.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

export function renderPart(p: Part, status: PartStatus, usage: UsageData, openTask?: string) {
  const u = usage.parts[p.id];
  return `<article class="detail" data-part="${esc(p.id)}">
    <header class="detail-head">
      <button class="icon-btn back" data-close type="button" aria-label="Terug naar overzicht">${icon.close}</button>
      <p class="eyebrow">${esc(p.group)}</p>
      <h2>${esc(p.name)}</h2>
      <div class="pills">${statusPill(status)}<span class="cov c-${p.coverage}">${COVERAGE[p.coverage]}</span></div>
      <p class="desc">${esc(p.description)}</p>
      ${status.level !== 'unknown' ? `<p class="sub">${esc(status.detail)}</p>` : ''}
    </header>
    ${p.caution ? `<div class="caution">${icon.warning}<p>${CAUTION_TEXT[p.caution]}</p></div>` : ''}
    ${tasksBlock(p, openTask)}
    ${warningsBlock(p.warnings)}
    ${torquesBlock(p)}
    ${specsBlock(p)}
    ${intervalsBlock(p, u)}
    ${toolsBlock(p)}
    ${partNosBlock(p)}
    ${gapsBlock(p)}
    <footer class="disclaimer">${icon.info}<p>${esc(DISCLAIMER)}</p></footer>
  </article>`;
}

export function renderOverview(statuses: Map<string, PartStatus>, usage: UsageData, sourceName: string) {
  const counts = { due: 0, soon: 0 };
  statuses.forEach((s) => {
    if (s.level === 'due') counts.due++;
    if (s.level === 'soon') counts.soon++;
  });
  const hasData = [...statuses.values()].some((s) => s.level !== 'unknown');
  const groups = GROUP_ORDER.map((g) => {
    const list = parts.filter((p) => p.group === g);
    if (!list.length) return '';
    return `<section class="block"><h3>${esc(g)}</h3><ul class="part-list">${list
      .map((p) => {
        const s = statuses.get(p.id)!;
        return `<li><button type="button" data-select="${esc(p.id)}"><i class="dot s-${s.level}" title="${esc(s.label)}"></i>
          <span class="pl-name">${esc(p.name)}</span><span class="cov c-${p.coverage}">${COVERAGE[p.coverage]}</span></button></li>`;
      })
      .join('')}</ul></section>`;
  }).join('');
  return `<article class="overview">
    <header class="detail-head">
      <p class="eyebrow">Specialized Venge Pro · 2019</p>
      <h2>Onderhoud</h2>
      <p class="desc">Klik op een onderdeel van de fiets of kies het hieronder. Je krijgt de stappen, aandraaimomenten en waarschuwingen uit je eigen handleidingen, met bij elke stap de bron.</p>
    </header>
    <section class="block summary">
      ${
        hasData
          ? `<p><strong>${counts.due}</strong> ${counts.due === 1 ? 'onderdeel' : 'onderdelen'} toe aan onderhoud, <strong>${counts.soon}</strong> binnenkort.</p>`
          : '<p>Nog geen kilometerdata ingevuld. De statuskleuren worden actief zodra je <code>content/usage.json</code> invult.</p>'
      }
      <p class="sub">Bron: ${esc(sourceName)}${usage.bikeKm != null ? ` · kilometerstand ${num(usage.bikeKm)} km` : ''}${usage.updated ? ` · bijgewerkt ${esc(usage.updated)}` : ''}</p>
      <div class="legend"><span><i class="dot s-ok"></i>In orde</span><span><i class="dot s-soon"></i>Binnenkort</span><span><i class="dot s-due"></i>Onderhoud nodig</span><span><i class="dot s-unknown"></i>Geen gegevens</span></div>
    </section>
    ${groups}
    <section class="block sources"><h3>Bronnen</h3><ul>${manuals
      .map((m) => `<li><strong>${esc(m.short)}</strong><span class="sub">${esc(m.file)}${m.use !== 'bron' ? ' · alleen gebruikt voor Nederlandse vaktermen' : ''}</span></li>`)
      .join('')}</ul>
      <p class="sub">De handleidingen zelf staan niet op deze site. Alle teksten zijn eigen samenvattingen met paginaverwijzing.</p></section>
    <footer class="disclaimer">${icon.info}<p>${esc(DISCLAIMER)}</p></footer>
  </article>`;
}
