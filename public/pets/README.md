Optional Clawmate assets
=======================
The app runs without generated assets. To use a pet created with the linked
hatch-clawmate skill, copy its final 1536 × 4576 spritesheet.webp here and map
an exact player ID to its URL in manifest.json:

    { "123456": "/pets/moss.webp" }

The renderer uses idle row 0 and running-right row 1 / running-left row 2 of the skill's 8 × 22
atlas. Paths must start with /pets/. Restart is unnecessary; reload the browser.
Generate assets using vendor/hatch-clawmate-skill/SKILL.md. That workflow is
optional and separate from the game's procedural generator. Mossbyte is included
as a pre-generated sample in mossbyte.png. The vendored skill is MIT licensed.
