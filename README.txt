# Legendary Mayhem

A community custom game mode for [Azeroth Survivors](https://wow.aethus.pl/): cross-map bosses, Rune Storms, random events, growing rewards and automatic endless.

**Windows launcher · Host only in co-op · Pre-match settings · No cheat menu or cheat hotkeys**

## Download

[**Download the Windows EXE**](https://github.com/Starcraft-Bank/azeroth-survivors-mayhem/releases/latest/download/AzerothSurvivorsCustomMode-0.4.1.exe) · [ZIP with instructions and licenses](https://github.com/Starcraft-Bank/azeroth-survivors-mayhem/releases/latest/download/AzerothSurvivorsCustomMode-0.4.1-Windows-x64.zip) · [All releases, checksums and privacy audit](https://github.com/Starcraft-Bank/azeroth-survivors-mayhem/releases)

Requires Windows 10/11 x64, current Microsoft Edge or Google Chrome, internet and working WebGPU. Python is included; no Python install, browser extension, terminal commands or administrator access is needed. This community executable is unsigned.

## How to play

1. Download and run **AzerothSurvivorsCustomMode-0.4.1.exe**.
2. Click **Launch Legendary Mayhem**. Keep the launcher open while playing.
3. On the character/map screen, open **Pre-match settings** in the bottom-right panel.
4. Choose boss damage, Legendary timing and the events you want. Start your match normally.
5. In co-op, **only the host runs this launcher**. Friends join with the normal game. Wait until everyone appears in the host's lobby roster before entering the map.

Finish or leave your old match and close an older Mayhem launcher before opening this version. The launcher uses its own persistent browser profile. Closing the launcher closes its game browser.

The normal game's movement and skill-choice keys remain available. The panel can be collapsed with its minus button.

## Pre-match settings

| Setting | Choices | Default |
| --- | --- | --- |
| Boss damage | Gentler, Balanced, Brutal | Balanced |
| First guaranteed Legendary | 0–30 minutes | 0 |
| Add another Legendary every | 1–30 minutes | 10 |
| Event pool | Enable/disable each of the four events | All enabled |

**Balanced** is halfway between the original gentle damage curve and the previous harder build. Boss health stays tough. Mayhem bosses retain extra health, damage and faster native abilities.

The default guarantees are **one Legendary from the start, two at 10 minutes, three at 20 minutes**. Set the first minute to 5 and the interval to 10 for a 5/15/25-minute schedule. Guarantees cap at three eligible choices. Remaining choices and equipment drops use normal rarity; exhausted-pool gold rewards remain normal.

Preferences save locally. They lock and collapse when the match begins, stay locked through victory/endless, and become editable again after leaving the match. **Restore defaults** restores the recommended setup.

## What the mode changes

- **Cross-map boss waves every two minutes of game time.** Before endless, extra waves use non-final bosses. The ordinary map boss schedule remains active.
- **Four wave modifiers:** Crossroads, Frenzy, Spellstorm and Double Trouble. Every fourth extra wave can bring two bosses.
- **Progressively tougher enemies.** Bosses gain health, damage, speed and faster native casts. Ordinary mobs also grow stronger. Existing health pools are not repeatedly multiplied.
- **Mayhem bosses are stronger than normal bosses:** an additional 3x health, 1.3x damage, 1.05x movement and 20% shorter cooldowns, before wave-specific adjustments.
- **Growing gold income:** pickups start at 1.25x, grow by 0.15x per minute, and cap at 8x. Existing balances are not refilled; normal chest and reroll costs apply.
- **Automatic endless:** defeating the map's final boss records native victory processing and continues the party without a manual Keep fighting click. The results screen may briefly flash during the credit/save transition. Endless rotates through all twelve maps' final bosses.
- **Boss-kill fireworks** and shared native game announcements.
- The extra-wave controller pauses at **eight living bosses**. Native encounters can still occur.

This release has mode controls only. It has no optional cheat accordion, God-mode buttons, rapid-skill/XP/area switches, manual spawners, Instant win or collection-unlock controls.

## Random events

The first **Rune Storm** is due at **1:30** of active game time when selected. If Rune Storm is disabled, an enabled event is used instead.

Later events begin **90–150 seconds after the previous event ends**. Rune Storm has extra weight. Events avoid immediate repeats when more than one type is selected. A single selected type can repeat.

Starts may wait for a clear announcement window, the Double Trouble window to pass, or boss pressure to fall below six living bosses.

| Event | Duration | What happens |
| --- | --- | --- |
| **Rune Storm** | 10 seconds | Three bursts, around 0/4/8 seconds. Each living player receives two warning circles to dodge. |
| **Treasure Rush** | 30 seconds | Doubles actual pickup income on top of the growing bonus, capped at 16x. Prices stay normal. |
| **Guardian Hunt** | 20-second event window | Summons one native rare/guardian from another map, with its own AI, name and normal loot. |
| **Berserker Rush** | 20 seconds | New ordinary reinforcements gain another 1.35x damage and 1.2x movement speed. |

A guardian can survive its event window. Surviving Berserker reinforcements keep their assigned strength; subsequent spawns return to normal scaling when the event ends.

## Ground hazards and camping

Normal scripted hazards occur every **20 seconds**. Staying within roughly half a yard for **six seconds** can trigger another burst, with an eight-second repeat cooldown. Moving resets that timer; upgrade screens suspend camping detection for that player.

Circles provide a **2.5-second warning** before impact. Each impact is capped at **20 damage before endless, or 10 during endless**, before native defenses. Overlapping circles can both hit. Rune Storm uses the same safety limits and a 32-circle cap, then gives normal hazards a fresh 20-second countdown.

These are temporary damaging zones, not solid walls. No valid living enemy means a burst waits for a safe native source.

## During-match controls

- **Automatic endless:** turn automatic continuation on/off.
- **Random events:** pause future events and cancel active event modifiers.
- **Pause extra waves:** pause the extra boss schedule; resuming starts a fresh two-minute countdown.
- **Arena hazards:** controls scripted circles, including Rune Storm.
- **Boss-kill fireworks:** toggles celebration effects.

Already spawned enemies and circles finish naturally. The ordinary game continues when extra waves/events are paused.

Mayhem and selected cosmetic notices share the native banner system with readable spacing and priority for event warnings. Urgent combat, downed-player and revive alerts remain immediate. The host's detailed panel is local; native announcements and world effects reach normal-game guests.

## Saves and privacy

This mode uses:

    %LOCALAPPDATA%\Azeroth Survivors Custom Mode\Browser

It does not automatically copy your normal browser's save or unlock your collection. To bring progress across, export a copy through the original game's **Options > Saves > Export Save**, then use **Import Save** in the Mayhem game browser. Normal game progress saves normally.

The **Exported saves** button opens downloaded exports for the current Windows user. The Backups folder may contain backups from older launcher versions.

Only share the release EXE/ZIP. Do not share your Browser, Backups or Exported Saves folders.

Release contents are audited for personal profile paths, account identifiers, credentials and saved-game data. The package contains code, its runtime, an icon and documentation—not the creator's browser profile, cookies, saves or screenshots. See [PRIVACY.md](PRIVACY.md) and the release's **PRIVACY-AUDIT.json** and **SHA256SUMS.txt**.

## Compatibility and troubleshooting

Supported official builds:

- **0.120.5**, asset stamp **7553bc3a76db**.
- The previously verified **0.120.4**, asset stamp **86a011904793**.

Unknown game builds load the ordinary game without applying the mode. If the panel reports an unsupported build, check for a newer release here.

If the game cannot start, update Edge/Chrome and check WebGPU support. If the launcher reports that its profile is already open, close the previous Mayhem launcher/browser first.

A brief native victory transition can be visible before automatic endless. The game's own progression validation remains intact. Co-op and long-run balance testing are ongoing; please report the map, mode settings, approximate match time and what happened, without uploading personal saves or browser profiles.

## Build the launcher from source

The repository includes the runtime and the verified patch specification. It does not bundle the game's WebAssembly or assets.

On Windows with Python 3.12 installed:

    py -m pip install -r requirements-build.txt
    py build_windows.py
    py audit_release.py

The built EXE and ZIP are written to **dist/**. Rebuilding the launcher does not regenerate support for an unknown game build.

## Credits

Unofficial community project for [Azeroth Survivors](https://wow.aethus.pl/) by Aethus. Not affiliated with or endorsed by Aethus or Blizzard Entertainment. The WoW icon is Blizzard's official favicon; attribution and runtime license notices are included. The game itself is downloaded from the official site at runtime and is not redistributed.

Project code: [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md).
