Discord: https://discord.gg/pC4n2fvrmD

# Azeroth Legendary Mayhem — native edition 0.10.0

A host-run custom mode for Azeroth Survivors. Only the host needs Mayhem; friends use the ordinary game.

## New in 0.10.0

- Version Check - Removed identity-only blocking; matching hooks allow unverified builds to launch.
- World Controls - Added game speed, mob/boss movement, spawn rate and density settings.
- Rewards - Added XP and gold starting rates, growth per minute and caps.
- Stampede - Added timed enemy haste with configurable delay, interval, duration and strength. Default OFF.
- Affixes - Added native selection and Rift Pulse, Death Echo and Nemesis Hunt challenges with bonus loot.
- Difficulty - Renamed presets to Easy, Normal, Heroic and Mythic. Existing numeric settings are preserved.

## Configure the run

Press **Insert** and use **Apply settings**. Settings are saved locally and reused next launch.

| Panel | Options |
| --- | --- |
| World | Game speed ON/OFF (default OFF), 50–200%; mob and boss movement 50–300%; spawn rate and density 25–300%. |
| Rewards | XP/gold ON/OFF, starting rate 25–1,000%, growth 0–100 percentage points per match minute, cap 25–2,000%. |
| Events | Stampede ON/OFF (default OFF), first delay 10–900s, repeat 30–900s, duration 5–120s, movement boost 100–300%. Duration must be shorter than repeat. |
| Affixes | Native Game default / Disabled / Custom; choose Bolstering, Sanguine and Explosive. Optional Mayhem affixes default OFF, interval 30–300s, four difficulties and 0–100% bonus rewards. |

100% retains the existing rate. Movement changes affect living and newly spawned enemies without stacking each frame. Lowering density never deletes existing enemies; the native living-enemy cap is adjusted, with a 500-enemy ceiling. Spawn rate affects ordinary scheduled mobs, not Mayhem boss intervals or scripted summons.

Game speed changes host simulation time, including guests' host-simulated actors, timers, waves and hazards. Transport deadlines and menu animations remain normal. At 200%, a two-minute match timer takes about one real minute.

XP starts at 100% with no growth. Gold keeps the existing 125% start, +15 percentage points per minute, capped at 800%. Treasure Rush doubles gold after that setting. Example: XP start 100%, growth 10, cap 300% reaches 2× at ten minutes and 3× at twenty. Existing balances and levels are unchanged; native level caps remain.

**Native affixes:** Game default preserves the original selection; Custom applies the selected native effects; Disabled clears them for this run. Returning to Game default restores the original selection. The game's native Heroic I–V rank, progression eligibility and associated rewards stay tied to the lobby choice. Mayhem's four preset labels do not grant a higher native rank.

**Mayhem affixes:**
- Rift Pulse - Dodge rings, then collect a gold/XP bounty and power-up.
- Death Echo - A dead boss leaves telegraphed runes, followed by a bonus chest and bounty.
- Nemesis Hunt - Defeat the summoned foreign rare to earn a chest and bounty.

Rift Pulse and Nemesis Hunt alternate when both are selected. Death Echo triggers on boss deaths. Custom rune warnings are 2.5 match seconds; native defenses still apply. Affix difficulty increases rune counts, damage and rewards. These optional affix runes are independent of the Arena hazards toggle. Map travel clears pending old-map affix challenges.

## Start playing

1. Keep your downloaded game and its Data folder together.
2. Run AzerothSurvivorsMayhemNative-0.10.0.exe.
3. Browse to your game's AzerothSurvivors.exe.
4. Click Launch Mayhem. In the game, press INSERT to open the overlay.
   Use windowed or borderless mode; exclusive fullscreen is unsupported.
   Choose your settings and press Apply. INSERT or Escape closes the panel.
5. Pick a character/map and start a match using the normal game menus.
6. Keep the launcher open while playing. Closing it closes its game too.

Requires Windows 10/11 x64. Automatic compatibility detection reads the selected
EXE without starting or attaching to a game. Use **0.130.0 / e7d9dd47**
on both host and guests for the current tested mode. Reviewed adapters for
0.120.5, 0.122.0 and 0.123.0 remain included; current validation targets 0.130.0.
Native two-client LAN tests verified shared hazards and Endless; ordinary
combat verified saved class Marks for the host and an unmodified guest.
Actual reroll input verified the 1,000-gold cap and fixed-jewelry Luck filter.
Long Internet sessions and balance still need playtesting.

Build/version identity no longer blocks launch. If every required hook matches at its configured location, an unknown build launches automatically as UNVERIFIED BUILD using that adapter. Memory layouts and behavior may have changed; crashes or broken features remain possible. Missing/moved hooks and ambiguous adapters still stop launch. This does not automatically port the trainer to future builds. Unlock All still requires a supported save catalog.

Use Check compatibility in the launcher before playing. It never opens a game.
The local compatibility-report.json has file hashes, sizes and match results,
without personal file paths, saves or process access. Share that report when a
new build needs support. It is saved under %LOCALAPPDATA%/LegendaryMayhemNative.
The --diagnose --game <EXE> --report <JSON> command performs the same offline
check without showing a window. Build identity is advisory; missing required hooks stop launch. Administrator access and a separate
Python installation are not needed. This community executable is unsigned.

This launches your existing native game. It does not replace game files,
install game assets, or transfer browser saves. It uses your ordinary native
save. Back up/export your save before experimenting with a custom mode.
Close the normal game before starting the launcher. The game updater is disabled
for the launched session so it cannot replace the checked binary. Update the
ordinary game separately between sessions, then check compatibility again.

## Insert overlay settings

Boss health and Boss damage are separate dropdowns:
Easy / Normal / Heroic / Mythic.

Health uses 25% / 50% / 75% / 100% of the previous Mayhem health curve.
Mythic preserves the previous health setting. Damage: Easy is the gentler
curve, Normal the previous midpoint, Heroic the harder curve, and Mythic adds
35% to Heroic. Defaults: Mythic health, Normal damage.

First guaranteed Legendary: 0–30 minutes. Add another every: 1–30 minutes.
Defaults: one from the start, two at 10 minutes, three at 20 minutes.
Guarantees apply to eligible upgrade choices, cap at three, and leave
ordinary item drops and exhausted-pool gold rewards alone.

Enable or disable Treasure Rush, Guardian Hunt, Berserker Rush and Rune Storm.
Preferences are saved locally. Press Apply to commit your edits. You can change
settings during a match: boss tuning affects new spawns, event durations affect
the next event, and hazard tuning affects new circles. Online play continues
while the overlay is open. The overlay is visible only to its host; native
Mayhem event announcements and mechanics still reach guests.

Combat: separate boss difficulties, boss interval (60–600 seconds), Legendary timing.
Events: enabled pool, first-event time, minimum/maximum breaks, individual durations.
Hazards: normal/storm/barrage circle counts and intervals, barrage duration, camping
trigger, obstacle damage difficulty and optional damage growth per minute.
Obstacle damage presets multiply base damage by 0.5 / 1 / 1.5 / 2. Growth adds
0–10% per minute, capped at an additional 300% (4x). Growth defaults to zero.
The shared 128-circle safety cap and 2.5-second warning remain in place.
Rewards: bounty cadence, extra pickups/chests, reroll cap and luck-item filter.
Hazards also offers rune formations and extra native cone/line attacks.
Session: announcement sound, boss fireworks and automatic Endless. Extra waves, events and hazards
can each be disabled. Restore defaults selects the defaults; Apply commits them.
The values in the Mayhem rules below describe the defaults.

## Mayhem rules

Extra cross-map bosses arrive every two minutes of active game time.
Final bosses are excluded until native victory has occurred and endless
has actually started. Endless then rotates final bosses from all twelve maps.
Every fourth extra wave can spawn two bosses. Extra waves wait when eight
living bosses are present. The ordinary encounter schedule stays active.

Boss health, damage, speed and native ability cooldowns scale with time.
Mayhem bosses receive an additional 3x health, 1.3x damage, 1.05x movement
and 20% shorter cooldowns. Wave modifiers include Frenzy, Spellstorm and
Double Trouble. Ordinary mobs also grow stronger over time.

Gold income starts at 1.25x, gains 0.15x per minute and caps at 8x.
Treasure Rush doubles this for 30 seconds. Rerolls are capped as described above; there is no
unlimited-gold balance or automatic refill.

Defeating the map's final boss completes the game's native victory processing,
then automatically selects Keep fighting. A results screen may briefly appear
during that transition. Boss deaths trigger native spell-visual fireworks.
Mayhem announcements use the game's own banner system. Routine boss/loot
notices queue behind a Mayhem banner instead of immediately replacing it.

## Hazards and events

Normal hazards: six circles per living player every ten seconds.
Standing in one place for six seconds can trigger an additional burst;
camping bursts repeat no faster than every eight seconds.

Each extra boss arrival starts a barrage for up to 30 seconds:
eight circles per player every three seconds. It ends early if every
registered Mayhem boss is killed. Rune Storm takes over the cadence on overlap.

Rune Storm: 30 seconds, eight circles per player every 2.5 seconds
(twelve scheduled bursts). The shared limit is 128 active circles; player
priority rotates when that limit prevents serving everyone at once.

Circles warn for 2.5 seconds before impact. Normal impacts target 20% of
maximum health, bounded to 25–250 raw damage; storms/barrages target 25%,
bounded to 35–350. Defenses apply. Move out before they detonate.

The first event is due at 0:45; Rune Storm is first when enabled.
Later events begin 35–60 seconds after the previous event finishes.
Starts can wait for announcements or excessive boss pressure to clear.
Treasure Rush and Rune Storm last 30 seconds; Guardian Hunt and Berserker
Rush last 20. Guardian Hunt brings a foreign rare; Berserker Rush strengthens
and accelerates newly arriving mobs. Immediate repeats are avoided when
multiple events are enabled. Rune Storm has extra selection weight.

## Co-op

Only the host runs Mayhem. Friends use the normal compatible game client.
Use the game's normal hosting/joining controls and wait until every guest
has picked a character and appears in the roster before starting the map.
Native networking and the host's simulation carry shared changes.

Two-client LAN checks verified repeated map transfers, preserved progression
fields, loading protection and native saved Marks. Automatic rotation and
randomized selection have additional regression checks.
This is an early native edition. Solo integration checks cover real native
boss/hazard creation, a full Rune Storm, arrival barrages, Legendary choices,
earned-gold scaling and victory-to-endless. A two-client native LAN test also
verified shared boss waves, hazard circles, game banners, guest Legendary
choices, native victory credit and automatic endless on both clients.
Internet co-op and longer matches still need playtesting; report the native
build, map, player count and issue.
Do not assume a browser guest or a different game build is compatible.

## Privacy and source

The download contains the launcher, its hooks/profile, runtime licenses and
guide. It contains no game executable/assets, developer save, browser profile,
personal settings, credentials, screenshots or private test fixtures.
Only the executable path and mode preferences are stored locally under
%LOCALAPPDATA%\LegendaryMayhemNative. No launcher analytics or upload exists.
The game retains its own normal network/save behavior.

Source, releases, checksums and privacy audit:
https://github.com/Starcraft-Bank/azeroth-survivors-mayhem

Unofficial community project; not affiliated with Aethus or Blizzard.
There is no God mode, rapid-skill menu, manual spawner, instant win or
collection-unlock control in this mode.
