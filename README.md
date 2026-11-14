# Exilogue

Path of Exile 1 league compendium: launcher, live session/map/campaign stats from `Client.txt`, and an in-game overlay.

## Run from source
```
npm install
npm start
```

## Test
```
npm test
```

## Build (Windows x64)
```
npm run package
```
Output: `dist/Exilogue-win32-x64/Exilogue.exe`

## Layout
- `src/core/`: pure log parser + tracker (no Electron, fully tested)
- `src/main/`: Electron main process (log watcher, game detection, hotkeys, overlay window)
- `src/renderer/`: dashboard UI; every tab is a module in `src/renderer/modules/` registered via `EX.register()`
- `src/overlay/`: overlay window
- `tools/`: demo data + mockup screenshots

Settings and stats live in `%APPDATA%\Exilogue\` (`config.json`, `state.json`, backups as `state.backup-*.json`).
