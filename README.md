# bessagoncc / deadzone <sub>[GLS] 2.0</sub>

A lightweight first-person arena-shooter prototype with drivable car, enemy waves, pickups, hitscan weapon, and a peer-to-peer multiplayer experiment.

## Run locally
Open `index.html` from a local web server (recommended, since browser pointer-lock and WebGL behavior varies for file URLs). For example:
- VS Code Live Server, or
- `python -m http.server 8000` then open `http://localhost:8000`.

## Host on GitHub Pages
1. Create a repository and upload `index.html`, `style.css`, and `game.js` to the repository root.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

## Host on Vercel
Import the repository into Vercel and deploy as a static site. No build command is required.

## Multiplayer caveat
The prototype uses PeerJS's public cloud signaling broker to establish direct peer-to-peer connections. This is a free-to-try prototype, not a guaranteed production multiplayer service. Public broker limits/availability, browser networking restrictions, and host availability can affect room connections. For a reliable public release, use a maintained free-tier signaling/backend service or self-host an open-source WebSocket server. GitHub Pages itself cannot run a persistent multiplayer server. Host first, then have friends enter the exact same room code and join. If networking fails, Solo still works.

## Controls
- WASD: move / drive
- Mouse: aim
- Left click: fire
- E: enter/exit the nearby car
- Space: handbrake while driving
- Esc: release mouse

## Performance notes
The scene uses simple low-poly geometry, no real-time shadows, capped pixel ratio, a modest arena, and inexpensive enemy logic. Three.js and PeerJS are loaded from public CDNs, so an internet connection is required to load the game libraries.

## Add your own 3D assets
Put optimized `.glb` files in an `assets/` directory and load them with Three.js `GLTFLoader`. The current build intentionally uses primitive geometry as a fallback because no custom models have been attached to this chat yet. Prefer low-poly models, 1–2 materials per prop, compressed textures, and keep individual textures around 512–1024 px for low-end devices.

## What's new

- **Rounds:** each round spawns a fixed number of raiders; clear them all to finish it, get a bonus and a breather, then a bigger and tougher wave. Every 5th round brings a boss.
- **Eliminations:** enemies fall over, burst into debris and sink away. Headshots deal double damage; you can also run them over.
- **PvP:** the host picks *PvP · first to 15 frags*. Players shoot each other, respawn with brief protection and see a live scoreboard. The host relays traffic so 3+ players can see each other.
- **Bigger, nicer map:** 168×168 arena, shadows, sky, textured ground, distant mountains and rocks, antialiasing.
- **Gun feel:** ammo and reload (R), recoil, sway, bob, sprint (Shift), muzzle flash, shotgun pellets, hit markers.

- **Map voting:** at the start of every PvP match the host runs a 12-second vote (click or press 1/2/3). Maps: The Yard, Mega Market (grocery store) and Auto Plaza (car dealership). Layouts are seeded so every player sees the same map.
- **Cars:** a green beam marks the car, you can drive with the mobile joystick, cars collide with cover and other players see your car.
- **Sprint:** Shift (hold), Ctrl (toggle) or the SPRINT button above the mobile joystick.

- **Auto SMG:** weapon slot 4, hold to fire (hold the FIRE button on mobile).
- **Emotes:** press G (or tap EMOTE on mobile) for the wheel, press 1–8 or tap to emote; others see a bubble over your head. Choose Customize to mix and match your 8 slots from 14 emotes; your setup is saved in the browser (localStorage).

- **Accounts (Firebase):** username + password only. Setup: paste your web config into `firebase-config.js` and publish `firestore.rules`. Accounts reserve their usernames; guests can't use a reserved name. Signed-in players skip the callsign box, sync emote layouts, edit their character (hair, hats, eyewear, chains, shoes, skin, outfit) and can use chat (press `/`).
