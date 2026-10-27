# Legendary Mayhem — native edition 0.8.0-preview.1

A community custom mode for the native Windows Azeroth Survivors game.
The native edition is now the main development target. The browser launcher is
legacy; its older releases remain available in the release history.

## Start playing

1. Keep your downloaded game and its Data folder together.
2. Run AzerothSurvivorsMayhemNative-0.8.0-preview.1.exe.
3. Browse to your game's AzerothSurvivors.exe.
4. Click Launch Mayhem. In the game, press INSERT to open the overlay.
   Use windowed or borderless mode; exclusive fullscreen is unsupported.
   Choose your settings and press Apply. INSERT or Escape closes the panel.
5. Pick a character/map and start a match using the normal game menus.
6. Keep the launcher open while playing. Closing it closes its game too.

Requires Windows 10/11 x64. Automatic compatibility detection reads the selected
EXE without starting or attaching to a game. This preview includes adapters for
0.120.5 / e0e2410c and 0.122.0 / 508416ff. The older gameplay behavior has been
preserved; the 0.122.0 adapter has static code/ABI/layout review only. Native
playtesting of that adapter is pending. Use this as a preview, not a proven
replacement for an ongoing session.

Detection scans instruction patterns and independently verifies the reviewed
loaded code/data image. It accepts compatible timestamp/checksum/certificate
or preferred-base packaging differences, instead of requiring one exact file
size/hash. Changed logic/layout still requires a new adapter. This does not
promise universal compatibility with every past or future version.

Use Check compatibility in the launcher before playing. It never opens a game.
The local compatibility-report.json has file hashes, sizes and match results,
without personal file paths, saves or process access. Share that report when a
new build needs support. It is saved under %LOCALAPPDATA%/LegendaryMayhemNative.
The --diagnose --game <EXE> --report <JSON> command performs the same offline
check without showing a window. Unknown/incompatible builds are not launched. Administrator access and a separate
Python installation are not needed. This community executable is unsigned.

This launches your existing native game. It does not replace game files,
install game assets, or transfer browser saves. It uses your ordinary native
save. Back up/export your save before experimenting with a custom mode.
Close the normal game before starting the launcher.

## Insert overlay settings

Boss health and Boss damage are separate dropdowns:
Easy / Hard / Brutal / Insane.

Health uses 25% / 50% / 75% / 100% of the previous Mayhem health curve.
Insane preserves the previous health setting. Damage: Easy is the gentler
curve, Hard the previous midpoint, Brutal the harder curve, and Insane adds
35% to Brutal. Defaults: Insane health, Hard damage.

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
Session: boss fireworks and automatic Endless. Extra waves, events and hazards
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
Treasure Rush doubles this for 30 seconds. Prices stay normal; there is no
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
