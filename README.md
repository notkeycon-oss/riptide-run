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
- **Five maps**: Harbor Point, Red Rock Canyon, Coral Lagoon, Storm Point, and **Breakers Bay**, a stunt circuit with huge swells and kicker ramps. Clean landings refill your boost.
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
