# Venge-onderhoud

**Live:** https://baskitsz.github.io/Venge-monteur/

> Deze repo is openbaar en bevat alleen de code en eigen samenvattingen. De PDF-handleidingen van de
> fabrikanten staan in de **privé**-repo `baskitsz/Venge-manual` en komen nooit in deze repo of op de site.

Interactieve onderhoudssite voor een Specialized Venge Pro (2019). Klik op een onderdeel van het
3D-model voor instructies, aandraaimomenten en waarschuwingen, met bij elke stap de bron
(handleiding + pagina).

> **Status:** online via GitHub Pages. Elke push naar `main` publiceert automatisch (zie `.github/workflows/deploy.yml`).

## Wat de site doet

- 3D-model van de fiets: klik op een onderdeel (of kies het in de lijst) en de camera zoomt in.
- Per onderdeel: taken met afvinkbare stappen (bewaard in je browser), aandraaimomenten, specificaties,
  waarschuwingen, gereedschap, onderdeelnummers en wat **niet** in de handleidingen staat.
- Bij elke stap en waarde staat de bron (handleiding + pagina; bestandsnaam in de tooltip).
- Zoeken (toets `/`) over onderdelen, taken, stappen en waarden.
- Statuskleuren uit `content/usage.json` (zie hieronder), licht/donker thema, werkt op mobiel.
- Directe link naar een onderdeel: `.../#/brakes`, `.../#/chain` enz.

## Lokaal starten

Eenmalig [Node.js](https://nodejs.org) (versie 20 of hoger) installeren, dan in deze map:

```bash
npm install      # eenmalig
npm run dev      # start de site op http://localhost:5173
```

## Statuskleuren (kilometers)

Vul `content/usage.json` in. Voorbeeld voor de ketting, elke 3.000 km (dat interval is je **eigen keuze**;
de handleidingen noemen geen km-intervallen):

```json
"bikeKm": 12000,
"parts": {
  "chain": { "lastServiceKm": 9500, "intervalKm": 3000 },
  "di2":   { "lastServiceDate": "2026-09-01", "intervalMonths": 6 }
}
```

Vanaf 80% van het interval wordt een onderdeel oranje ("binnenkort"), vanaf 100% rood ("onderhoud nodig").
De bron is uitwisselbaar (`src/usage.ts`, interface `UsageSource`), zodat later bijvoorbeeld Strava
de kilometerstand kan leveren.

## Bouwen

```bash
npm run build    # controleert eerst de data, bouwt dan een statische site in dist/
npm run preview  # bekijk de build lokaal
```

`dist/` bevat alleen de site (HTML, CSS, JS); geen PDF's.

## 3D-model

Het model is procedureel opgebouwd in `src/bike/model.ts` (geen los 3D-bestand). Elk onderdeel is een aparte
groep met dezelfde ID als het databestand in `content/parts/`. Maten zijn gebaseerd op een typische Venge maat 56;
kleuren en details (olie-glans logo's, paarse stuurlint, Roval-velgen) op de referentiefoto.

## Mappen

| Map | Inhoud | In git? |
|---|---|---|
| `manuals/` | Lokale kopie van de PDF-handleidingen (voor het controlescript) | **Nee** (staat in `.gitignore`) |
| `reference/` | Foto van de fiets als referentie | Nee |
| `content/manuals.json` | Register van handleidingen (id, bestandsnaam, aantal pagina's) | Ja |
| `content/parts/<id>.json` | Onderhoudsdata per onderdeel | Ja |
| `content/ONTBREKEND.md` | Lijst met handleidingen die nog ontbreken | Ja |
| `scripts/validate-content.mjs` | Controleert bronnen en waarden | Ja |

## Spelregels voor de data

- Elke stap, getalwaarde, waarschuwing en interval heeft een `source`: `{ "manual": "<id>", "page": <nr> }`.
  Het paginanummer is het PDF-paginanummer (kan afwijken van het gedrukte nummer, bijv. als p.1 een voorblad is).
- Staat iets niet in een handleiding, dan komt het in `notFound` (de site toont dan
  "niet gevonden in handleiding"). Er worden geen waarden verzonnen.
- Eigen aanvullingen (zoals ketting reinigen) krijgen `"origin": "own"` en `"source": null`,
  en mogen **geen getallen** bevatten.
- De Tarmac SL7-handleiding staat in het register als `alleen-terminologie` en mag niet als bron worden gebruikt.
- Teksten zijn eigen Nederlandse samenvattingen, geen letterlijke kopieën.

Onderdeel-ID's (stabiel, gekoppeld aan het 3D-model):
`frame, fork, headset, stem, handlebar, seatpost, saddle, bb, crankset, powermeter, chain, cassette, rd, fd, shifters, brakes, di2, wheelF, wheelR, tires`

## Een nieuwe handleiding toevoegen

1. Upload de PDF naar de **privé**-repo `Venge-manual` (niet naar deze openbare repo) en zet lokaal een kopie in `manuals/` (staat in `.gitignore`).
2. Voeg een regel toe aan `content/manuals.json` met een korte `id`, de `file`-naam, het aantal `pages` en `"use": "bron"`.
3. Werk het juiste bestand in `content/parts/` bij: voeg stappen, `torques`, `specs` of `warnings` toe,
   elk met `source`. Haal opgeloste punten weg uit `notFound` en `neededManuals`.
4. Controleer:
   ```bash
   node scripts/validate-content.mjs
   ```
   Het script controleert dat elke bron bestaat en, als `pdftotext` is geïnstalleerd, dat elk
   aandraaimoment en elke spec letterlijk op de genoemde pagina staat.
5. Site opnieuw bouwen: `npm run build` (of lokaal bekijken met `npm run dev`).
6. Pushen naar `main`: GitHub bouwt en publiceert de site automatisch. In GitHub draait dezelfde controle, alleen
   zonder PDF's (die staan daar niet); de controle van waarden tegen de PDF's gebeurt dus lokaal in stap 4.

Tip: met Claude kun je zeggen "verwerk manuals/<bestand>.pdf in de onderhoudsdata volgens de README".

## Disclaimer

De instructies zijn een hulpmiddel en vervangen de officiële handleidingen niet. Raadpleeg bij twijfel
de handleiding van de fabrikant of een fietsenmaker, zeker bij carbon onderdelen en remmen.
