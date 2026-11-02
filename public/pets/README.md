# Generated pets

The five shared defaults are mossbyte.png, toast-panic.png, sir-honk.png,
blob-ross.png and buffer-cat.png. Each is a transparent 1536×4576 Hatch Clawmate
atlas: eight columns, 22 rows, 192×208 cells. Selected generated source strips,
provenance, contact sheets, QA and animation previews live in assets/pet-runs/.
Packaged pet.json and WebP sheets live in assets/pets/.

Idle is row0, right/left locomotion rows1/2, party waving3, jumping4, frustrated5,
sleepy waiting6, spinning13, affection16 and dancing20. All other skill states are
also included. Neither renderer recolors or synthesizes pet art.

Default selection uses the stable viewer seed modulo five. Admin-commissioned
nickname pets import here as JOB_ID.png only after validation, then automatically
replace that viewer’s default. The legacy manifest.json can map a player ID to a
/pets/ atlas URL in the browser, but production assignment uses the admin queue.

The generation workflow is vendor/hatch-clawmate-skill/SKILL.md (MIT).
