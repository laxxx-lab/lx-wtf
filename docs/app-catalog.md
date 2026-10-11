# Installed applications in Lilith modes

`readAppCatalog()` returns at most 500 distinct `{ id, name }` entries. Discovery runs the fixed `scripts/list_apps.ps1` locally through Windows PowerShell with a 15 second timeout and UTF-8 JSON. It reads the current user's Start Menu app IDs with `Get-StartApps`, then reads user/common Start Menu shortcuts for desktop applications. It does not read credentials, resolve protected executables, change files, or launch applications.

The selector stores an entry's `id` directly in the existing `mode.apps` string array:

- Store applications: `app:SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify`.
- Desktop applications: absolute local `.lnk`, `.exe`, or `.appref-ms` paths. Existing paths remain compatible.

`validateAppId(id)` accepts a raw `namespace!app` AUMID of at most 128 ASCII characters. Each side starts with a letter/digit and may contain letters, digits, periods, underscores, and hyphens. Exactly one exclamation mark is required. Commands, spaces, controls, separators, URI schemes, and opaque desktop IDs are rejected. `normalizeAppCatalog(raw)` accepts native `{ Name, AppID }` or normalized `{ name, id }` rows, filters invalid rows, trims names, and deduplicates references case-insensitively. Paths also deduplicate across slash directions. The first valid entry wins.

`runMode(mode, actions)` preflights all references and required actions before changing state. Store entries call `actions.openApp(rawAumid)`, while file entries call `actions.openPath(path)`. Both actions must return `''` to report launch acceptance; nonempty strings, other return values, and exceptions report failure. Results retain `{ path, accepted, error }`, including the original `app:` reference in `path`. Apps alone never imply task completion, and mode instructions are returned for Hermes without being executed here.

`launchCatalogApp(rawAumid)` spawns the local Windows `explorer.exe` with one `shell:AppsFolder\<AUMID>` argument, without a command shell or arbitrary arguments. Its promise returns `''` when Explorer is spawned, and rejects process startup errors. This means the activation request was dispatched; it does **not** prove installation, an app window, playback, or another requested operation. Hermes must check the resulting UI and perform those operations locally through Windows-MCP. No SSH GUI launch is used. Tests replace process boundaries and never start actual apps.

Discovery is limited to Start Menu entries for the signed-in user and shared shortcuts. Unlisted applications and desktop StartApps identifiers without a valid local app path are omitted; desktop shortcuts can still be selected. Entries are not installed-app guarantees and may become stale or point to broken shortcuts.

Sources: [Microsoft's AUMID and Get-StartApps documentation](https://learn.microsoft.com/en-us/windows/configuration/store/find-aumid), [Microsoft PowerToys AppsFolder activation implementation](https://github.com/microsoft/PowerToys/blob/main/src/modules/Workspaces/WorkspacesLauncher/AppLauncher.cpp).
