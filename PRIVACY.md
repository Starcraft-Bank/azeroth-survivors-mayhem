# Privacy

The native launcher selects a bundled adapter for the selected game and launches
that one child process with in-memory mode hooks. Launching does not require a
matching version or a successful instruction-pattern scan. Original game files and
assets are neither bundled nor edited. The launcher contains no analytics,
credential reader, browser-profile access, or save upload functionality.

The selected game path and mode preferences remain in the user's own local
settings file under `%LOCALAPPDATA%/LegendaryMayhemNative`. They are never
included in the downloadable release. The game uses its ordinary native save
and networking. Gameplay may persist rewards through the game's normal save
processing. Closing Mayhem also closes the game it launched.

The release is built from an explicit allowlist. Private native test fixtures,
save files, developer paths/settings, game assets, browser profiles, logs,
screenshots and credentials are excluded. A release-specific audit and SHA-256
checksums accompany downloads. No launcher can control a game's own privacy
behavior; see the original game's information for that.

Compatibility reports remain local and include hashes and sizes; optional diagnostics also include pattern matches. They exclude the selected path and save contents. Optional diagnostics do not access running processes or upload reports.

## Optional release updates

At startup and when you select Check for updates, the launcher requests public release metadata from its project's GitHub API. This sends no game saves, settings, local paths or credentials. GitHub receives ordinary connection metadata, such as the network address and application user agent. No account or token is used. The check runs in the background and never blocks launch; it does not download or install software. Download update opens the project's GitHub release page in your browser.
