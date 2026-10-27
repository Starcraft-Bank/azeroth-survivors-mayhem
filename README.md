# Legendary Mayhem — native edition 0.6.0

[Download the native Windows EXE](https://github.com/Starcraft-Bank/azeroth-survivors-mayhem/releases/latest/download/AzerothSurvivorsMayhemNative-0.6.0.exe) · [ZIP with guide and licenses](https://github.com/Starcraft-Bank/azeroth-survivors-mayhem/releases/latest/download/AzerothSurvivorsMayhemNative-0.6.0-Windows-x64.zip)

A community custom mode for the native Windows Azeroth Survivors game.
The native edition is now the main development target. The browser launcher is
legacy; its older releases remain available in the release history.

## Start playing

1. Keep your downloaded game and its Data folder together.
2. Run AzerothSurvivorsMayhemNative-0.6.0.exe.
3. Browse to your game's AzerothSurvivors.exe.
4. Choose your settings, then click Launch native Mayhem.
5. Pick a character/map and start a match using the normal game menus.
6. Keep the launcher open while playing. Closing it closes its game too.

Requires Windows 10/11 x64 and native game 0.120.5 (build e0e2410c).
The complete executable fingerprint is checked before launch. Other builds
are rejected without installing hooks. Administrator access and a separate
Python installation are not needed. This community executable is unsigned.

This launches your existing native game. It does not replace game files,
install game assets, or transfer browser saves. It uses your ordinary native
save. Back up/export your save before experimenting with a custom mode.
Close the normal game before starting the launcher.

## Pre-match settings

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
Preferences are saved locally. Settings lock when a match starts and stay
locked through victory/endless. Leave the match to change them.

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
