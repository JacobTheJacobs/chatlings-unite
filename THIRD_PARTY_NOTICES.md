# Third-party references and dependencies

- Hatch Clawmate Skill: https://github.com/JacobTheJacobs/hatch-clawmate-skill,
  commit `547daca8fdb38860fdba0d656f254e09b8195267`, copyright 2026
  JacobTheJacobs, MIT license. The skill is an optional external dependency;
  this repository contains compatibility patches and generated pet run artifacts.
  Its license notice is preserved in `licenses/hatch-clawmate-MIT.txt`.
- Clawmate desktop: the provided ClawMate.Core/PetSimulationService.cs and pose
  selection implementation informed the Python desktop motion and presentation.
  The original desktop application and clawmate-bridge are not required to run
  Chatlings Unite and are not bundled here.
- `@openai/codex-sdk` is installed through npm using `package-lock.json`.
  Python/Pillow, GTK, Cairo and libwnck are installed separately. Each dependency
  retains its own license; the setup instructions describe their installation.

The five default pet atlases were generated through the Hatch Clawmate workflow.
Their source strips, run manifests and QA artifacts are included under `assets/`.
