[![Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/pC4n2fvrmD)

## Update notices

The launcher checks its project's public GitHub release metadata in the background when opened. Select Check for updates to check again; if a newer release is available, Download update opens its GitHub page. Updating is optional: notices never block launching or playing, and nothing is downloaded or installed automatically. A failed or offline check leaves the launcher usable.

The request sends no game saves, settings, local paths or credentials. GitHub receives the ordinary connection metadata needed to serve the request.

# Azeroth Legendary Mayhem 0.11.1

A host-run custom mode for the native Windows game. Only the host needs Mayhem; friends join using the ordinary game.

## Start playing

1. Download the EXE or extract the Windows ZIP. Keep the original game EXE and its Data folder together.
2. Open Mayhem, browse to AzerothSurvivors.exe and select Launch Mayhem. The launcher can be placed beside the game or elsewhere.
3. Use windowed or borderless mode. Press INS to open the control panel.
4. Choose settings and press Apply. Start a solo match or host co-op through the game menus.
5. Keep Mayhem open. Closing it also closes the game it launched. INS or Escape closes only the panel.

Windows 10/11 x64; no Python or browser extension installation is required. Settings are saved locally. Online matches continue while the host's panel is open.

## Settings categories

| Category | Controls |
| --- | --- |
| Combat | Boss health/damage difficulties, boss movement, cross-map waves, arena hazards, arrival barrages and separate idle punishment. |
| Population | Normal mob movement, spawn rate and living-mob density. |
| Rewards | Legendary schedule, XP/gold rates, growth and caps, supplies, reroll cap and Luck filtering. |
| Affixes | Persistent, timed and reward affixes; individual difficulties/settings and native affix selection. |
| Session | Shared game speed, automatic map rotation, automatic Endless, sounds, fireworks and live status. |

Each Mayhem affix shows its name, description and toggle. Its own difficulty and settings appear only while enabled; hiding them preserves your choices. Group master switches also hide their disabled settings. Combat hazard groups expand separately. Restore defaults selects defaults; Apply commits them. Existing preferences are preserved, including settings migrated from the former Events tab.

## Five persistent Mayhem affixes

These affect ordinary combat throughout a run. The master switch defaults OFF. Each affix has its own Easy / Normal / Heroic / Mythic difficulty and individual settings.

- **Pack Tactics:** Nearby enemies reduce each other's incoming damage. Split packs apart to remove their protection. Set radius (4–30) and reduction per ally (1–20%); total reduction is capped at 60%.
- **Blood Frenzy:** Wounded enemies gain damage and movement speed. Set the activation threshold (10–60% HP) and boost (10–150%).
- **Revenant Legion:** Defeated normal mobs can spawn a weaker native creature from the current zone at their corpse. Set chance (0–60%) and health (10–75%). Revenants give bonus gold/XP when killed and cannot create another revenant. Existing native models are reused.
- **Nemesis Bond:** Mayhem waves summon linked boss pairs when the living-boss limit permits. Killing one enrages its surviving partner. Set damage enrage (10–200%); the movement increase is half that amount.
- **Soul Debt:** Ordinary kills increase enemy damage and bank a bounty. A boss kill pays out gold/XP and clears the debt; debt of at least 25 also gives a chest. Set debt per kill (1–5 percentage points) and cap (10–200%).

Each affix's difficulty scales its own configured effects. Turning modifiers off removes their live stat multipliers. New runs and map travel clear pending affix state; rewards already collected remain.

## Native and reward affixes

Native selection offers Game default, Disabled or Custom:

- **Bolstering:** Enemy deaths strengthen nearby enemies.
- **Sanguine:** Slain elites leave pools that heal enemies.
- **Explosive:** Destroy explosive orbs before they detonate.

Game default restores the run's original affix selection. The game's Heroic I–V rank and progression rewards remain tied to the game-lobby choice; Mayhem's preset names do not grant native rank rewards.

These reward challenges now live under **Affixes**, alongside the persistent and timed affixes:

- **Rift Pulse:** Dodge telegraphed ground runes, then collect gold, XP and a power-up.
- **Death Echo:** A defeated boss leaves corpse runes, followed by a bonus chest and bounty.
- **Nemesis Hunt:** Defeat a foreign rare enemy for a chest and bounty.

Each has its own difficulty and reward bonus. Rift Pulse and Nemesis Hunt have independent repeat intervals; Death Echo follows boss deaths. Their master switch defaults OFF. These affixes are independent of the Arena hazards toggle.

## World pace and rewards

Shared game speed is adjustable from 50–200% and defaults OFF. It changes player movement, combat timers, waves and hazards for the whole party. Network deadlines and menu animations keep normal timing. At 200%, two match minutes take about one real minute.

Mob and boss movement are separately adjustable from 50–300%. Spawn rate and density range from 25–300%, with a 500-enemy living cap. Lowering density never deletes existing enemies. Ordinary spawn rate does not change the Mayhem boss interval or scripted summons.

XP and gold each have an ON/OFF switch, starting rate (25–1,000%), growth per match minute (0–100 percentage points) and cap (25–2,000%). XP defaults to 100% without growth. Gold defaults to 125%, +15 points per minute, capped at 800%. Treasure Rush applies an additional 1.5 / 2 / 2.5 / 3× gold multiplier according to its own difficulty. Existing balances/levels are unchanged and native level caps remain.

Guaranteed Legendary choices default to one from the start, two after ten minutes and three after twenty. Configure first Legendary time and the interval; the quota caps at three eligible choices.

Boss kills drop native bounties. Recurring milestones increase rewards and add chests; extra supplies spawn around the map. Configure supply intervals, milestone frequency, the reroll-price cap (up to 1,000 gold) and filtering of future fixed-Luck ring/trinket rewards. Equipped items and amulet affixes are unchanged.

## Bosses, timed affixes and hazards

Cross-map bosses use shuffled pools and arrive every two match minutes by default. Final bosses join the pool only after native victory and Endless activation. Existing wave/scaling progress continues across maps. Every fourth wave can be a double wave; extra waves wait at eight living bosses.

Boss health and damage each use Easy / Normal / Heroic / Mythic. Health presets retain 25% / 50% / 75% / 100% of the established Mayhem curve. Defaults are Mythic health and Normal damage. Enemies grow stronger with match time.

The timed affix rotation includes:

- **Treasure Rush:** Temporarily increases gold pickups. Set its difficulty and duration.
- **Guardian Hunt:** Spawns a rare enemy from another map. Set its strength and rotation duration.
- **Berserker Rush:** Strengthens and speeds up normal enemies. Set its difficulty and duration.
- **Rune Storm:** Repeatedly targets the party with mixed ground attacks. Set its difficulty, duration and burst interval. Easy / Normal / Heroic / Mythic requests 10 / 13 / 16 / 19 runes per player per burst; count and damage follow its own difficulty. Rune patterns are always mixed.

Choose which timed affixes can appear, their shared first delay and minimum/maximum breaks. Breaks start after an affix ends; busy boss moments can delay the next one. Rune Storm goes first when selected. There is no shared difficulty setting.

**Stampede** temporarily boosts mob/boss movement on its own schedule. Set its own difficulty, first delay, repeat interval, duration and speed bonus. It defaults OFF. Duration must be shorter than the repeat interval.

Normal arena hazards and boss-arrival barrages live under Combat. Configure their counts, intervals, barrage duration and obstacle damage. Pattern choices include rings, crosses, lanes, spirals, scatter, and supported native cone/line attacks. Rune Storm has its separate controls under Affixes. Warnings last 2.5 match seconds. All ground circles share a 128-active-circle cap, so large parties or overlapping attacks can reduce actual counts. Faster game speed shortens their real-time warning.

**Idle-player punishment** is a separate Combat switch with a standing-still timer. It places circles beneath idle players and resets when they move. It retains the ordinary obstacle count/damage settings, works with arena hazards and all affixes disabled, and is not changed by Rune Storm difficulty.

Hazard base damage is 20% max HP (25–250), or 25% (35–350) during storms/barrages, before native defenses. Difficulty multiplies damage by 0.5 / 1 / 1.5 / 2: Rune Storm uses its own difficulty; ordinary hazards, barrages and idle circles use the Combat obstacle difficulty. Optional obstacle time growth is capped at an additional 300%.

## Co-op, Endless and collection progress

Only the host runs Mayhem. Host and guests must use game builds that can join one another normally. The INS panel is host-only; native announcements, mechanics and rewards are replicated through the game.

Automatic Endless continues after native victory. Eligible cross-map Endless bosses grant the game's own permanent class Marks and gear rewards to host and guests under native rules. Spend Marks through the game's ordinary permanent progression menus. Public Mayhem has no cheat or Unlock All menu.

Automatic map rotation is an ON/OFF control under Session. When enabled, it chooses a shuffled destination every three match minutes and keeps player levels/items, wave count and scaling. Turning it on starts a fresh countdown. Transfers pause during reward choices; a transfer already underway finishes. Completion rewards remain tied to the original run.

## Startup and diagnostics

Launching does not require a matching version or a successful hook-pattern scan. Hook installation failures are reported separately while other hooks remain active. If the shared extension runtime cannot initialize, partial hooks are unloaded before gameplay and the normal game opens instead.

Unknown builds use a best-effort bundled layout, so changed game code or memory layouts may still require fixes. Native gameplay was tested on 0.130.0 and the 0.130.1 hotfix. The new adapter follows relocated code addresses; earlier adapters remain available. Optional diagnostics do not block launch. Collection/save-format checks remain separate from launching.

The launcher does not patch the game EXE or distribute game assets. It uses your ordinary native save. Game self-updating is disabled for its launched session; update the ordinary game separately between sessions. Source, licenses, checksums and a privacy audit accompany the public release.
