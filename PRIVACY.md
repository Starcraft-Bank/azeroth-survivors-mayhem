# Privacy and local data

The Windows EXE and ZIP contain custom-mode code, runtime libraries, an icon and documentation. They do not contain the creator's browser profile, cookies, game saves, screenshots, private logs, account credentials or local development data.

The launcher creates a separate persistent profile under %LOCALAPPDATA%\Azeroth Survivors Custom Mode\Browser for the person running it. Saves and preferences belong to that Windows user. Explicit save exports go to the sibling Exported Saves folder. A Backups folder can remain from earlier launcher versions.

There are no collection-unlock controls or automatic save imports. To transfer progress, export a copy from the original browser and import it through the game's normal save interface.

The launcher opens the official game site. The site and its asset/co-op services receive their normal network traffic. This launcher adds no analytics, telemetry, remote control or automatic file-upload service.

Only distribute release files. Do not distribute the generated Browser, Backups or Exported Saves folders. Release assets include a content audit and SHA-256 checksums. The source tree is published from an explicit runtime-file allowlist.
