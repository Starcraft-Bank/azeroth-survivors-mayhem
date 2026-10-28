# Privacy

The native launcher scans the selected game's instruction patterns and reviewed runtime identity and launches that
one child process with its in-memory mode hooks. Original game files and
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

Compatibility reports remain local and include hashes, sizes and pattern matches. They exclude the selected path and save contents. The detector does not access running processes or upload reports.
