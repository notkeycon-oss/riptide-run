# Riptide Run — full audit and the NEXT preview

The preview lives at **https://notkeycon-oss.github.io/riptide-run/next/**.
The live game (`riptide.html`), the admin panel and the vice panel are unchanged.

## How the preview is kept separate

| What | Live game | NEXT preview |
|---|---|---|
| Saved progress (money, mastery, unlocks, settings) | `localStorage` keys `rr_u_*`, `riptide_run_v2` | Same keys with a `rrnext:` prefix. Your live save is **copied** in the first time you open the preview, then the two never touch again. |
| Leaderboards, world records, ghosts, published maps | Written by the game | **Read only.** The preview never posts times or maps, so nothing done in it can reach the live boards. |
| Your player profile on the server | Written by the game | Read only (only the "online now" dot is written, so friends can still see you). |
| Chat, online board, friend lobbies | Shared | Shared: you can chat with and race people on the live game. |

## What the audit found

**Biggest gaps (things players notice)**
1. **Nothing to race when friends are offline.** Time trials against a ghost were the only solo mode.
2. **No music.** Races were silent apart from a basic two-oscillator engine drone.
3. **No controller support.** Keyboard and touch only.
4. **No tutorial.** New players had to work out boost, gates and flag sides on their own.
5. **Default graphics were High** on every machine, which is heavy for school Chromebooks. The resolution scaler helped, but the game never dropped its quality level.
6. **Boats left no lasting wake.** Spray particles vanish in under a second, so speed was hard to feel.

**Bugs found while testing**
- A late frame timestamp (e.g. a tab waking up) could give a negative frame time and fling the camera off into space. Now clamped.

**Things that were already solid** (kept as they are): boat physics, the seven maps, the economy and garage, friend lobbies with bumping, chat and the online board, the admin and vice-admin systems, and leaderboard protection against boosted runs.

## What's new in NEXT

### 🏆 Race Rivals (new main-menu mode)
- Five AI boats on a starting grid, with you in the middle of it. Works on every map except Coral Lagoon (a collect map has no racing line).
- **Three difficulties, tied to the medal times:** EASY races at bronze pace, NORMAL at silver, HARD at gold. The leading rival hits that time almost exactly on every map; the rest of the pack is 2–12 % slower.
- Each rival follows a racing line worked out per map. The line threads every gate, takes flags on the correct side, lines up with the lava ramps on Magma Rift and swerves early around rocks, trees and gators. On Gator Bayou, rivals spread across the different routes.
- Rivals brake for tight corners, launch off ramps, ride the waves, lean into turns and throw spray and wake.
- **You can bump them.** Hit a rival and it gets shoved aside and loses speed. They steer round you rather than ramming you.
- A gentle catch-up rule (±5 %) keeps races close without feeling like cheating.
- Pays out by finishing place. Each map card shows the hardest difficulty you've beaten there. Rival races never touch the leaderboards.
- Starts instantly: the rival boats are built in the background while you're on the menu.

### 🎵 Music and sound
- **A procedural soundtrack** (synthesised live, nothing to download), with its own mood on every map:
  - Harbor: bright and poppy.
  - Canyon: driving.
  - Lagoon: tropical.
  - Storm: intense minor.
  - Breakers: surf-rock major.
  - Bayou: slow and swampy.
  - Magma: heavy.
  - Menu: chill.
- **It builds with the race:** calm on the menu, hats and bass on the countdown, full beat when racing, and extra drive and risers on the final stretch. It ducks while you're paused.
- **Better engine:** a sub-octave rumble, a "chug" that pulses with the revs, light saturation, and a jet-whoosh while boosting.
- Separate **Music** and **Sound effects** volume settings. **M** mutes both.

### ✨ Visuals
- **Foam wakes:** a fading V of white water behind every boat (yours, rivals' and friends').
- **Speed lines** at high speed. A stronger streak burst, a blue edge glow and a wider camera angle while boosting. These can be turned off in Settings → Speed effects.

### 🎮 Controls and comfort
- **Gamepad support:**
  - Left stick or d-pad steers.
  - RT or A is throttle; LT or B is brake.
  - X or RB boosts.
  - Y resets to the last gate.
  - START pauses.
  - In menus, A starts a time trial and Y starts a rival race.
- **How to Play card:** shows once for new players and is always available from the menu.
- **Auto graphics:** machines with 4 or fewer CPU cores start on Medium. If the game still struggles at the lowest resolution, it steps the quality down once on its own, unless you set quality yourself.

## How it was tested
- **AI pace:** every map and difficulty was simulated at 150 s (90 runs), with the catch-up rule off.
  - All 5 rivals finished every race.
  - The leader's time was within 0.2 s of the target medal time.
- **Full rival race:** played through to the results screen. Checked placing, payout, the "beat EASY rivals" badge, and that rivals keep racing after you finish.
- **Start grid:** checked that rivals no longer shove you at the green light.
- **Friends features** were rerun against the preview:
  - Friend lobby with bumping.
  - Chat, the online board, "go to map" and "join lobby".
  - Quest notices.
- **Music:** every mood and every intensity was rendered offline. No errors and no clipping.
- **Screenshots** checked: menu, How to Play, settings, wakes on 4 maps, and the results screen.

## Making it the live game later
When you're happy with NEXT, it can replace `riptide.html`. Two things change when it does:
- `BETA` gets set to `false`, so times post to the leaderboards again.
- The `rrnext:` save prefix is dropped.

Ask Claude to "promote NEXT to live" and it will do both and keep everyone's saves.

## Ideas for the next round
- Rival "personalities" (an aggressive blocker, a boost-happy one) and a mini championship across 3 maps.
- Turn the speed plan into a ghost "racing line" that new players can switch on as a driving aid.
- Daily rival challenge: a seeded race that everyone gets on the same day.
