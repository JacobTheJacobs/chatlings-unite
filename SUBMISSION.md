# Chatlings Unite — submission draft

## Tagline
Your Twitch chat becomes a pixel world. Hatch, cooperate, and wake a giant guardian together.

## Project description
Chatlings Unite turns a Twitch community into tiny playable creatures in a shared pixel grove. A viewer can spawn from Twitch chat with `!spawn`, sign in to a synchronized browser controller, and move their character while the streamer displays the world as a transparent OBS browser source.

The community can collect and deliver three batteries to wake a Guardian, use dash, spring, magnet, and shield abilities, or fuse three characters into one Guardian with separate pilot, shield, and cannon roles. The host can summon a Glitch boss. Labeled simulated teammates make solo demonstrations possible.

Viewers get a seeded character immediately. They can request a custom appearance while continuing to play; a host can create and import a Clawmate sprite atlas, which triggers an egg reveal for everyone. Mossbyte is a pre-generated sample pet included with the project. Custom requests currently require host-operated generation and review.

The host can enable Mossbyte as a separate pet. When an API key is configured, the Codex SDK can choose a validated high-level goal, such as following a player or collecting a battery. The game executes movement locally. If Codex is unavailable, the interface clearly labels its local follow fallback.

## How Codex was used
Codex helped build the Node server, Twitch EventSub and OAuth integration, synchronized controller and OBS overlay, game rules, procedural avatars, custom-skin queue, Codex pet planner, tests, and setup documentation. The included Mossbyte sample was created through the Hatch Clawmate workflow using image generation and reviewed animation rows.

## Platform and setup
Node.js 24+, a Twitch developer application, a broadcaster user token, and an OBS browser source. A local demo runs without Twitch or a Codex API key. Setup and limitations are documented in README.md.

## Codex session ID
01a1993c-13f9-7090-a2a9-10bcbac1bee6

## Submission fields still needed
- Repository URL accessible to judges, with all source and instructions.
- Public or unlisted YouTube video under three minutes showing the project functioning on Twitch and showing Codex being used.
- Live verification of the actual Twitch chat spawn, controller sign-in, and OBS stream overlay.
- Devpost registration and completed submission. Confirm the project status reads Submitted.

## Suggested video sequence (under three minutes)
1. Show Twitch stream and OBS overlay, then send `!spawn` from a real Twitch account.
2. Sign into the controller as that user and show movement in the overlay.
3. Start the battery challenge and add explicitly labeled simulated teammates; demonstrate a delivery and the Guardian waking.
4. Show the included pre-generated Mossbyte reveal. Describe other custom skins as host-generated, not automatic.
5. Show the pet controls and, only if configured and verified, a real Codex-planned goal. Otherwise identify the local fallback honestly.
6. Show the Codex build thread and source/tests.
