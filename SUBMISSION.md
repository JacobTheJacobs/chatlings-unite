# Chatlings Unite — submission draft

## Tagline
Your Twitch chat comes alive as animated pets on your desktop.

## Project description
Chatlings Unite gives each Twitch chatter an animated desktop companion. A viewer's
first message spawns one of five generated default pets. Normal chat appears above
the pet in a speech bubble. Viewers control their own pet with `!left`, `!right`,
`!jump`, `!dance`, `!spin`, `!love`, `!rage`, `!party`, `!sleep`, `!stay`, and `!roam`.
No viewer installation or separate sign-in is needed for chat control.

The streamer can drag and throw pets. Window physics adds gravity, friction,
landings on exposed window tops, and collisions with window edges; Walk on screen
provides simpler movement. A transparent Linux X11 overlay puts pets over desktop
windows. OBS display capture includes them in the broadcast.

A small broadcaster-only admin page controls desktop pets, movement mode, and
custom pet assignments. Custom creatures are commissioned by the streamer and
inspired by each viewer's nickname. A local Codex worker uses the Hatch Clawmate
workflow to prepare all 22 animation rows, validate the atlas and review outputs.
The current pet remains until a validated replacement is ready. The five included
defaults were generated and reviewed; a complete new live custom commission has
not yet been demonstrated and must not be presented as verified.

## How Codex was used
Codex built the Node server, Twitch EventSub/OAuth integration, desktop renderer,
mouse interactions, physics, admin UI, leased generation worker, recovery logic,
tests, and documentation. The five default pets were created through the Hatch
Clawmate image-generation workflow with animation-row QA. Desktop motion also
references the provided Clawmate desktop implementation.

## Platform and setup
Node.js 24+, Linux X11 with GTK3, libwnck and compositing, a Twitch developer app,
a broadcaster chat authorization, and OBS display capture. README.md documents
setup, temporary hosting, generation dependencies, and limitations.

## Recorded Codex build session ID
01a1993c-13f9-7090-a2a9-10bcbac1bee6

Confirmed against the current Codex build thread.

## Submission checklist
- [x] Twitch chat connected and refresh token saved.
- [ ] Record a real Twitch chat message, bubble, control command, mouse throw and
      window landing. Extra pets may be the clearly labeled simulated viewers;
      a second real viewer account is not a submission requirement.
- [ ] Record a public YouTube demo under three minutes, showing the
      project functioning on Twitch and how it was built with Codex.
- [x] Published https://github.com/JacobTheJacobs/chatlings-unite with source,
      generated assets, setup instructions and attribution. Credentials and local
      state are excluded.
- [ ] Replace any placeholder submission fields with the repository and video URLs.
- [ ] Complete Devpost and verify its status reads Submitted.

## Suggested video sequence
1. Show the Twitch broadcast with pets over the desktop (not merely the landing page).
2. Send a normal message from a viewer: pet spawns and its bubble appears.
3. Demonstrate `!left`, `!jump`, and a reaction; use the labeled simulated pets
   to show a larger community without claiming they are real viewers.
4. Drag and flick a pet onto a visible window and show it settle.
5. Show the simple admin and the five generated defaults. Clearly distinguish the
   custom-generation workflow from any prerecorded generated examples.
6. Show Codex's build thread, source, and tests. Keep the full video below three minutes.

## Current delivery limits
The public URL is a temporary Cloudflare tunnel and depends on this machine
remaining online. This is a hackathon prototype, not a production hosting promise.
The old grove/fusion experiment remains in the repository but is not the main demo.
