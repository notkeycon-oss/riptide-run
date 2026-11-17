# Riptide Run

A browser powerboat racing game in a single file: open `riptide.html`.

## Controls
| Key | Action |
| --- | --- |
| W / S (or arrows) | Throttle / reverse |
| A / D | Steer |
| Space or Shift | Boost (recharges on a cooldown) |
| R | Back to last checkpoint |
| T / Q / P / C | Restart · menu · pause · camera |

On touch screens the ⚡ button is boost.

## What's in the game
- **Seven maps**: Harbor Point, Red Rock Canyon, Coral Lagoon, Storm Point, **Breakers Bay** (a stunt circuit with huge swells and kicker ramps, where clean landings refill your boost), and **Gator Bayou**.
- **Gator Bayou** is a dark, foggy cypress swamp sprint. The channel splits twice, so you pick your route:
  - First split: Cypress Run (wide and long), Root Tunnel (tight and short, full of trunks) or Gator Bend (log jumps and gators).
  - Second split: Sunken Village (under the stilt shacks) or Hollow Log (drive through a giant fallen tree).
  - There's also a hidden cut behind a curtain of vines. Gold here unlocks the Swamp Lantern paint.
- **Boost**: a burst of thrust that also tightens your carve. It recharges on a cooldown, and faster while you slipstream a rival.
- **Money and mastery**: every finished run (online or offline) pays money and mastery XP. Payouts scale with how hard the map is and how close you are to the gold time. On top of that you can earn first-time medal bonuses, a personal-best bonus, a daily streak bonus, and ×1.5 on the featured map of the day.
- **Engine tiers T1–T5**: mastery level unlocks each tier, and money buys it.
- **Garage**: paint jobs, helmet styles and colours, visors, race suit, skin tone, and a stern flag.
- **Leaderboard ghosts**: every leaderboard row has a 👻 RACE button that races that player's best run.
- **Play with friends**: create a 4-letter lobby code. Modes: Race, Knockout (the last boat each lap is out), and Slipstream (supercharged drafting).
- **Map builder**: place gates, rings, ramps, rocks, islands and logs, and pick the weather and waves. Then test drive, save, publish a share code, or browse community maps.

## Online setup (Firebase Realtime Database)
`ONLINE_DB` near the top of the second `<script>` points at the database. The game reads and writes these paths:
`names`, `players`, `lb`, `wr`, `live`, plus the new `gh` (ghosts), `lobbies`, `maps` (published custom maps) and `time` (clock sync).
If your rules only allow specific paths, add the new ones. Example rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true,
    "lb": { "$key": { ".indexOn": ["t"] } }
  }
}
```

Open rules like these are fine for a hobby game among friends. Firebase's "test mode" rules expire after 30 days, so replace them before then.

## Secure accounts and admin panel
With `FIREBASE_API_KEY` set (in `riptide.html` and `admin.html`), each racer's name + PIN becomes a real Firebase account behind the scenes. `database.rules.json` then makes sure racers can only change their own data. Only the admin account can edit or delete anyone's times.

Players who signed in before the upgrade are asked to enter their PIN once. Their old times and ghosts move over automatically.

- **Admin panel:** `admin.html` (not linked from the game). Sign in with the admin email and password you created in Firebase Authentication.
- **Rules:** copy `database.rules.json` into Firebase → Realtime Database → Rules, replace both `YOUR_ADMIN_UID` with your admin account's UID, then publish. Do this only after the game update with the API key is live, because the rules reject saves that don't carry a login.

## Vice admins

Open the **Vice Admins** tab in `admin.html` to make a friend a vice admin. They sign in at `vice.html` with their normal racer name and PIN.

You switch each ability on or off per friend:

- message/kick
- delete leaderboard times
- speed boost up to ×2
- give up to 5,000 money or XP at a time
- give shop items
- announcements

Vice admins can never unlock everything, ban, reset progress, rename, give exclusives or engines, take things away, change event settings or edit times. The database rules enforce this, and every vice action must write a server-timestamped entry to `vlog`. Those entries show up in your Activity Log. You can remove a vice admin, or pause all of them, at any time.

## Chat, online list and PIN changes

- **Map chat**: every map has its own chat room, shown on the home screen and floating on the left during a race. Press Enter or the 💬 button to type while racing.
  - The database allows one message every 2 s per racer and signs each message with the sender's own racer name.
  - Muted racers can't post, and a basic word filter masks swears.
  - You can turn race chat off in Settings.
  - In the admin panel, delete messages or clear a room under Maps & Lobbies, and mute a racer from their card.
- **Online now**: the home screen lists who's playing, which map they're on, and whether they're in a lobby. Use GO TO MAP to switch to a friend's map, or JOIN LOBBY to join their lobby.
- **Quests** finished during a race no longer interrupt you. The pop-up waits until you're back on the main menu.
- **Change PIN** (admin only): makes a fresh sign-in for the racer with a new PIN and moves all their progress onto it. Every device using the old PIN is signed out. PINs are never stored, so they can't be looked up, only replaced.

## Magma Rift, new boats, engine leaderboards

- **Magma Rift** is a night sprint down a volcanic rift, and the hardest map.
  - Three lava gaps (16, 20 and 24 m) have to be jumped off basalt ramps. Touch lava and you burn back to the last checkpoint.
  - The lava tube has steam vents that blast on a beat. The other route crosses basalt flats.
  - A tight hairpin gorge leads to the finish under an erupting volcano.
  - Gold unlocks the Lava Flow paint.
- **Boats** (Garage → BOAT): Patrol Boat, Mini Yacht and Swamp Airboat. Each needs mastery, money and challenges (races finished, medals, quests completed, airtime). All boats handle the same, because engines decide speed.
- **Titanic**: a 16 m ocean liner with smoking funnels. It's admin-exclusive and given from the admin panel's Exclusives box. It completes every map like any other boat.
- **Engine leaderboards**: the home screen records and the leaderboard default to the engine you have equipped.

