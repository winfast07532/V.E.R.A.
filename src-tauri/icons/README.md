# Icon Assets Required

Tauri's bundler needs real icon files here before `tauri build` will produce
installers. Generate the full set from one 1024×1024 source PNG using the
Tauri CLI (run from the project root, **not** from src-tauri):

```bash
npm install -g @tauri-apps/cli
tauri icon path/to/vera-source-icon-1024.png
```

This writes the following into `src-tauri/icons/`, all referenced by
`tauri.conf.json` → `bundle.icon`:

```
32x32.png
128x128.png
128x128@2x.png
icon.icns      (macOS)
icon.ico       (Windows)
icon.png       (Linux / tray)
```

Until these exist, `tauri build` will fail at the bundling step — `tauri dev`
works fine without them since dev mode doesn't bundle.

Suggested source art direction: a luminous purple sphere (#a78bfa core →
#4c1d95 edge) on a transparent background, matching the in-app Kinetic Orb
palette defined in `tailwind.config.js`.
