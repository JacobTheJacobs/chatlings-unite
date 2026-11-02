# Chatlings Unite

Twitch viewers hatch animated pets on the streamer’s desktop by chatting. Their
messages appear as speech bubbles, and chat commands trigger real sprite poses.
Five generated default pets are shared; only the broadcaster commissions custom
nickname-inspired pets. The optional browser grove also includes a cooperative
Guardian challenge.
Built with Codex. All application code is in this directory; the Codex SDK runs on the server.

## Run locally

Requires Node.js 24 or newer.

```bash
cd /home/jak/githuff/google/hackaton/twitch
cp .env.example .env
npm install
npm start
```

For desktop stream pets, connect Twitch chat as described below, then run
`npm run desktop` in a second terminal. OBS Display Capture includes the pets.
No viewer controller page is required for chat controls.

For the optional browser game, open http://localhost:3010. Click **Try the local demo**, then **Simulated friends**,
**Demo fusion**, and **Summon the Glitch**. You pilot; the two explicitly labeled
simulated teammates shield and shoot. WASD / arrow keys move, E joins the circle,
and Space activates a shield or cannon when assigned that role. Touch controls
are provided. A new browser session creates a separate demo player; tabs in the
same browser share the same character, like an authenticated Twitch account.

The cannon must be aligned within 100 world units vertically with the boss.
The boss pulses every four seconds. Shield lasts 1.1 seconds with a 1.6-second
cooldown; cannon cooldown is 600 ms. Failure scatters the Guardian; fuse again.
Use **Reset challenge** to release the team at any time.

- `/` — grove and host console
- `/controller` — synchronized world, keyboard and touch controller
- `/overlay` — transparent OBS browser source, 960 × 480

The overlay is transparent except characters, the fusion station, and combat HUD.
It shares state with the controller directly instead of relying on Twitch video
latency. Enable OBS Browser Source background transparency in its CSS if needed.

## Connect Twitch chat locally

After adding `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` to `.env`, restart
Chatlings and visit `http://localhost:3010/auth/chat` (or use the configured
localhost port). Sign in as the broadcaster and authorize `user:read:chat`. The
server validates the token, saves the broadcaster ID and chat token in the local
`.env` with restricted permissions, and connects EventSub. The token is never
shown in the browser. This convenience flow is available only for local demo
setup; public deployments should configure their own authorized token securely.
Watch the Twitch chat status on the host console. The token is not automatically
refreshed; reconnect chat if it expires.

## Connect real Twitch

1. Register an app at https://dev.twitch.tv/console/apps. Add the exact redirect
   URL `http://localhost:3010/auth/callback` for local testing.
2. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_BROADCASTER_ID`.
3. Obtain a **broadcaster user access token** for that same app with
   `user:read:chat`. Put it in `TWITCH_CHAT_TOKEN`. Never commit it.
4. Restart and run `npm run desktop`. A viewer’s first chat message hatches a
   default pet; regular messages become speech bubbles. Chat commands control it.
   Browser sign-in and `/controller` remain optional for keyboard movement.
5. For remote viewers serve over HTTPS, set `PUBLIC_URL` to that exact origin,
   and register `PUBLIC_URL/auth/callback` in the Twitch console.
6. Set `DEMO_MODE=false` and a strong `HOST_KEY` for a public deployment. Enter
   that key in the host console. Host actions require it. In keyless demo mode,
   host actions are allowed only from loopback connections.

Viewer sign-in uses an authorization-code exchange and validates the returned
identity on the server. Its scope is empty: basic identity is enough to control
a character. Chat uses the separate broadcaster token, validated at startup and
hourly. The EventSub connection handles message deduplication, reconnect handoffs,
and ordinary retries. Renew an expired/revoked chat token in `.env` and restart;
automatic chat-token refresh is not implemented.

Official references:
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
- https://dev.twitch.tv/docs/authentication/validate-tokens/
- https://dev.twitch.tv/docs/chat/authenticating/
- https://dev.twitch.tv/docs/eventsub/handling-websocket-events/

## Pet creation with your linked skill

The supplied repository is cloned at `vendor/hatch-clawmate-skill` (MIT).
All five defaults are pre-generated with this skill, including complete 22-state
animation atlases. Normal chat joins reuse these assets. Admin commissions use
`npm run hatchery:worker`, which invokes local Codex with the skill and validates
the result before swapping the pet. See **Five defaults and admin nickname
commissions** below.

Restore the vendor checkout on another machine:

```bash
git clone --depth 1 git@github.com:JacobTheJacobs/hatch-clawmate-skill.git vendor/hatch-clawmate-skill
```

## Architecture and limits

The Node HTTP server sends authoritative state at 20 Hz using Server-Sent
Events; controllers POST bounded input at 10 Hz. The server selects the player
from an opaque HttpOnly session cookie, ignoring any submitted player ID. Input
expires after 500 ms; diagonal movement is normalized. POST origin checks,
request-size limits, rate limiting, and host-key controls are included.

Character IDs and appearances persist in `data/players.json` every ten seconds
and on shutdown. Sessions are in memory and last 24 hours; restarting requires
sign-in again but retains the avatar. Simulated characters are excluded from
persistence. One server process hosts one grove. This is a hackathon prototype:
there is no multi-room isolation, moderation dashboard, session database,
automatic chat-token refresh, or production capacity validation. Keep the data
directory on a durable disk and protect access to your host key and `.env`.

## Verification

```bash
npm run check
npm test
```

Tests cover deterministic avatars, bounded/stale movement, restoration, fusion
roles, ability cooldowns, shields, victory, HTTP session isolation, foreign-origin
rejection, protected host actions, and shared streamed state. Real Twitch and OBS
must still be verified using your credentials and stream.

## Demo recording

1. Show the Codex build session and save its session ID (`/status`).
2. Add `/overlay` as a 960 × 480 OBS browser source, then go live on Twitch.
3. Send a real `!spawn` message; show the real Twitch character hatching.
4. Sign into the controller with that Twitch account and move it.
5. Add labeled simulated teammates; join the three players to fuse (E on each
   controller), or use **Demo fusion** while signed in as the host's player.
6. Summon the Glitch; demonstrate movement, shielding, cannon, and victory.
7. Reload the controller to show the same identity reconnecting.

The demo controls do not simulate Twitch traffic or viewers. Record real Twitch
integration separately from labeled simulation. No deployment, live stream,
submission, or real integration verification is implied by local test results.

## Request → Clawmate → live hatch

Only the broadcaster or host key holder can commission a creature for a viewer.
Its concept comes from the viewer’s nickname. The default remains playable while
a little egg marks the pending request. Requests are persisted,
limited to one active request per player, one new request per ten minutes, and
20 pending jobs total. Only one job may be marked as generating at a time.
Prompts are visible only to the host, not broadcast in world snapshots.

The worker performs generation in Codex using the linked Clawmate skill. For
a manual recovery, the host can instead operate the queue:

```bash
npm run hatchery -- list
npm run hatchery -- claim JOB_ID
```

Read the claimed prompt, review it, and follow
`vendor/hatch-clawmate-skill/SKILL.md` in Codex to generate and validate the pet.
Use a project-local run/output directory. The skill requires imagegen, grounded
animation rows, visual QA, and atlas validation. Do not feed viewer text into a
shell command or execute generated code. The manual queue bridge only imports assets. The separate worker invokes
Codex and uses the local Codex allowance; it does not invoke an external image API.

After completing the skill's visual and deterministic validation, import its
**final PNG** (not the preview or contact sheet):

```bash
npm run hatchery -- complete JOB_ID /absolute/path/to/final/spritesheet.png
# If generation fails:
npm run hatchery -- fail JOB_ID
```

The bridge checks PNG checksums, decoded pixels, dimensions, alpha-capable
format, occupied/unused animation cells, and the 12 MB size limit, then copies it into `public/pets/`. This intake check does not replace
Clawmate's row-by-row visual QA. The server confirms the
file before publishing the new skin. Every connected browser loads it, plays a
short egg/crack reveal, and swaps the appearance. Physics and identity stay the
same. Failed jobs keep the current skin. If generation is interrupted by a server
restart, the job returns to queued. Ready skins survive server restarts.

This is a **local, admin-authorized generation workflow**. Five defaults are bundled. The hatch UI reflects real queue state and only
reveals a skin after an actual asset is imported. The fusion boss fight and the battery-building challenge are both available.
Movement is top-down; platform climbing is not implemented.

The current image tool names some original outputs `exec-<UUID>.png` rather than
`ig_*.png`. Apply the included compatibility patch after a fresh vendor clone:

```bash
git -C vendor/hatch-clawmate-skill apply ../../patches/clawmate-imagegen-filenames.patch
git -C vendor/hatch-clawmate-skill apply ../../patches/clawmate-chroma-cleanup.patch
```

The patch retains the generated-images directory restriction, source hashes, and
all grounded-generation checks. It only accepts the tool's additional filename
format. Import validation now decodes bounded PNG data, verifies chunk checksums,
and checks occupied animation cells and transparent unused cells. Clawmate's
visual identity review is still required.

Asset assembly uses separate Python dependencies:

```bash
uv venv .venv --system-site-packages
uv pip install --python .venv/bin/python -r requirements-assets.txt
```

Use `.venv/bin/python` for Clawmate scripts if the host's system Pillow is older
than 9.1. The included run follows the frame counts in Clawmate's preparation,
extraction, composition, and validation scripts (six frames for extended work
rows); the repository's reference table has older five-frame counts for some
of those rows.


## Included AI pet: Mossbyte

**Try the local demo → Hatch Mossbyte sample** plays a real atlas reveal using the
included pre-generated asset. This is labeled as a sample, not a fresh generation
from a viewer prompt. Use a new demo session without a pending customization;
the ordinary ten-minute quota still applies. If you already have a pending job,
finish or fail it with the hatchery bridge first. Restart the server after updating
the project so the new sample control is available.

- Game asset: `public/pets/mossbyte.png`
- Packaged pet: `assets/pets/mossbyte/pet.json` and `spritesheet.webp`
- Original prompts and source hashes: `assets/pet-runs/mossbyte/`
- Atlas review: `assets/pet-runs/mossbyte/qa/contact-sheet.png`
- Automated reports: `assets/pet-runs/mossbyte/qa/review.json` and
  `assets/pet-runs/mossbyte/final/validation.json`
- Animation previews: `assets/pet-runs/mossbyte/qa/videos/`

Mossbyte was created with built-in imagegen using the linked Clawmate workflow:
one base image, delegated row generation, parent-approved mirrored running-left,
and parent assembly. Coding, read-file, and run-tool candidates were regenerated
to remove unwanted props/effects. All final used cells are occupied, all unused
cells are transparent, and Clawmate's reports contain no errors or warnings.
The pet is packaged locally; it has not been installed into or activated as a
Codex app companion.

Browser smoke checks use the host's Python Playwright and installed Chromium:

```bash
PREVIEW_URL=http://localhost:3199 python3 qa/browser-check.py
```

Start a throwaway preview on that origin with an empty temporary `DATA_DIR` to
avoid polluting a real grove. The smoke check creates demo players and jobs,
tests keyboard movement, fusion/challenge, reconnect identity, mobile overflow,
transparent overlay, and loading/revealing the bundled generated skin. It writes
screenshots in `qa/`. It does not connect to Twitch or verify a real broadcast.


## Let Codex play

1. Install dependencies with `npm install`, then put an OpenAI API key with access
   to Codex in `CODEX_PET_API_KEY` in `.env` and restart. Keep this key on the
   server. Without it Mossbyte uses a clearly labeled local follow behavior.
2. Join the grove as the host, enter the host key when configured, choose a
   personality and instruction, and press **Let Codex play**. **Stop pet** cancels
   the current decision and returns any carried battery.
3. Press **Start battery build**. Pick up a battery with E and press E near the
   robot to deliver it; E drops it elsewhere. Space jumps over the marked falling
   hazard. The simulated friends carry the first two batteries. Choose an ability
   and press F: Spark dashes, Bounce creates a spring pad, Magnet pulls nearby
   batteries, and Guardian shields nearby players. Abilities recharge in five
   seconds. Three deliveries wake the robot. The existing fusion mode is still
   available; finish or drop a battery before entering the fusion circle.

The pet uses one Codex SDK request at a time, with a 20-second ordinary-decision
cooldown, a five-second host-instruction limit, and a 12-second timeout. It sends
bounded position/ID snapshots, the host instruction, the mission event and current
goal. It does not send chat history or viewer names. A fresh thread and a JSON
schema keep each decision bounded; the server checks actions, target IDs, state,
and a 1–30 second duration before applying the goal. The game moves the pet and
executes the actions locally between decisions. A failed or invalid response falls
back to following the host. The UI distinguishes Codex decisions from local
fallback and reports successful decision count; token totals are available in the
world state. `follow` and `protect` target active unfused players; `collect`
targets available batteries; `celebrate` and `idle` use no target. The pet is
independent of players and cannot be controlled by viewer movement requests.

The SDK runs in a separate data directory using a minimal environment, read-only
sandbox, disabled web search/network access for tools, and no approval prompts.
These settings do not create a separate operating-system account or guarantee
isolation from all host-readable files; use an appropriately isolated host for a
public stream. Only a host key holder (or the local host in keyless demo mode)
can change pet behavior. For public use set `DEMO_MODE=false`, `HOST_KEY`, HTTPS,
and the correct `PUBLIC_URL`; Twitch and real Codex connectivity still need a
live test with your credentials. Decisions can incur usage costs. The local test
suite uses a mock planner and does not make a live model request.

Controls: WASD/arrows move, E interacts with batteries during the build and joins
fusion otherwise, Space jumps during the build or uses the fusion role, and F
activates the selected ability. Touch controls are available. The grove uses a
top-down movement plane with a jump animation and hazard dodge; it does not have
platform climbing or a physics-based platformer.

## Pets directly on your Linux desktop

With the server running, open another terminal in this project:

```bash
npm run desktop
```

This opens a transparent, always-on-top, desktop overlay with mouse input only on the pets on
Linux X11 with GTK 3, libwnck 3 and compositing. It reads the live game from localhost:3010.
Pets appear near the bottom of your primary monitor over your other windows.
Viewer movement in `/controller` moves the same pet on the desktop: sign in with
Twitch, click the game, then use WASD/arrows. E interacts, Space jumps, F uses a
power. The overlay does not intercept typing. Mouse clicks outside the pet sprites pass
through to your apps. Left-drag any pet, then release to drop or throw it. A slow
release drops it; a quick flick throws it with momentum. Pets fall under gravity,
bounce off exposed window sides/undersides, land and walk on visible window tops,
and fall when they walk off or their window closes/minimizes. Moving a supporting
window carries the pet. Right-click a pet to drop it from the top again.

Mouse grabbing belongs to the streamer at the local desktop; viewers cannot grab
other viewers’ pets remotely. Their chat commands still move/jump their own pet.
The desktop physics uses real window geometry on the primary X11 monitor. The
optional browser grove keeps its original game coordinates.

Every viewer uses one of five generated animation atlases until an admin-assigned
custom atlas is ready. The reference bridge is not required: Twitch's game
server supplies the shared positions. Stop the overlay with `npm run desktop:stop`.
`npm run desktop:snapshot` saves a transparent pet-only render, without capturing
your desktop. This implementation targets Linux X11; other desktops need a port.

To show these pets on Twitch, OBS must capture your **desktop/display**. The
native pets are included in that capture. Capturing only a game window may omit
them. `npm run obs:setup` prepares a desktop capture scene, with the optional
browser overlay hidden to avoid duplicate pets. Existing OBS collections are
preserved; import `obs/Chatlings_Unite.json` manually to use the updated scene.
If OBS is not installed, run `bash scripts/install-obs.sh` in your terminal.

Check the preview and close windows containing secrets, including `.env`, before
broadcasting. Connect Twitch in OBS Settings → Stream. These helpers do not start
a broadcast or recording. The Twitch page stays black/offline until you broadcast.

## Temporary public viewer controller

For a demo, stop the existing Node server and run:

```bash
npm run share
```

This downloads the official Cloudflare tunnel binary if necessary, creates an
HTTPS demo URL, configures `PUBLIC_URL`, disables demo identities, protects host
actions, and starts the Node server. Keep this terminal and computer running.
Add the printed `https://…/auth/callback` as an **additional** OAuth redirect URL
in your Twitch application's Manage page; keep the localhost callback too. Share
the printed `/controller` link with viewers. They sign in with Twitch, click the
grove, and use WASD/arrows or the touch controls. The broadcaster's signed-in
account gets host controls automatically; the host key also remains usable by
local management scripts.

Cloudflare Quick Tunnels are temporary development services, with changing
hostnames and no uptime guarantee. They do not support SSE, so Chatlings polls
state every 200 ms over the public demo URL while the local OBS source uses SSE.
This is a demo connection, not a production deployment. See the official
[Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
The tunnel exposes only this HTTP application. Unknown hostnames and
unauthenticated host actions are rejected; the local `.env` and data files are
outside the static file directory.

## Simple Twitch pet flow

A viewer's first chat message hatches a desktop pet. Their regular messages appear
above it in a speech bubble for eight seconds (up to 160 characters). Watching
silently cannot hatch a pet: Twitch does not send a reliable event for every
viewer opening a stream. No controller page or viewer sign-in is needed for chat.
Pets roam and jump automatically. Chat controls affect only the sender's pet:
`!left`, `!right`, `!up`, `!down` move briefly; `!jump` hops;
`!dance`, `!spin`, `!love`, `!rage`, `!sleep`, `!party` animate for six seconds.
`!stay` stops wandering; `!roam` resumes it. Commands are limited to about one per
second. Browser WASD control remains optional. Speech bubbles show public chat
on the captured desktop; this version does not remove bubbles on moderator deletion.

## Five defaults and admin nickname commissions

The shared default catalog is Mossbyte, Toast Panic, Sir Honk, Blob Ross and
Buffer Cat. A stable hash of the viewer ID selects one of five defaults. No image
generation runs on ordinary chat joins. Speech bubbles and chat controls work
with defaults and custom pets. Desktop and browser read the same generated atlas;
commands select real frame rows (jumping, vibe/dance, syncing/spin, reaction/love,
failed/rage, waving/party and waiting/sleep), rather than rotating a still image.
Commands use the skill's pose loops; a spin is a pose-turn loop, rather than a
whole-image rotation. New defaults add expressive dance, affection and sleepy poses.

Only the host can commission a custom pet. Sign in as broadcaster, choose a
viewer under **Custom nickname pets**, and click **Commission custom pet**.
You can also type `!custom viewername` in Twitch chat as the broadcaster.
Other viewers cannot use this commissioning command. The nickname is creative reference data; viewers cannot supply generation
instructions. A request queues one complete 22-state Hatch Clawmate run. Keep the
local Codex-auth generation worker running:

```bash
npm run hatchery:worker
```

The worker requires the local `codex` CLI login, imagegen and subagent tools,
Python virtual environment, and `vendor/hatch-clawmate-skill`. It processes one
commission at a time and records logs in ignored `data/hatchery/JOB_ID/`.
It uses normal Codex authentication, not the external image API. Generation can
take several minutes and uses your Codex allowance. Missing tools, failed QA or
failed generation retain the default pet; there is no fake successful swap.
Ready validated atlases swap without resetting pet position or speech bubbles.
The old manual `npm run hatchery -- list|claim|complete|fail` path remains available.

## Desktop physics verification

`npm run test:desktop` covers gravity, roof landing, ledge departure, moving/closed
windows, velocity-based throws, wall and underside bounces, occluded edges, fast
collisions, jumps and local body removal. `qa/window-surface-check.py` briefly
opens, moves and closes its own test window to check real geometry updates.
`qa/pet-input-region-check.py` checks the X11 input shape against the pet hitboxes.
`qa/pet-mouse-grab-check.py` exercises native grab, drag and flick-release in a
brief transparent probe without moving/clicking the OS pointer. These checks read
no screen pixels or window titles.

The GTK renderer adapts the gravity, drag sampling, throwing and perching approach
from the supplied ClawMate Core implementation. `clawmate-bridge` is not needed:
Twitch supplies pet identities/intent, while this renderer owns desktop physics.
