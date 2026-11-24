# OBS Studio 33 (`obs-ghost`) for Awesome-OS Code - OSS & Eclipse Theia

MIT-licensed Open VSX / VS Code extension that hydrates portable **OBS Studio 33** (`obs-win64.tar.zst` `33.0.3`), `libsectium_display`, and `b8g-ghost-abi` directly from [`awesome-os/b8g-ghost @ cas-v1`](https://github.com/awesome-os/b8g-ghost/releases/tag/cas-v1) with HTML5 browser-source overlay hot-reload and scene control.

## Install & Usage

### 1-Command `.vsix` Install (Awesome-OS Code - OSS / Eclipse Theia / VS Code)

```powershell
gh release download -R awesome-os/obs-vscode --pattern "*.vsix" --dir "$HOME/.b8g/cas/extensions" --clobber
```

Or download the `.vsix` from [`Releases`](https://github.com/awesome-os/obs-vscode/releases/latest) and run `code-oss --install-extension <file>.vsix` (or install from Open VSX once published).

### Usage

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

- **OBS Ghost: Hydrate Portable OBS Studio 33 (cas-v1)** (`obsGhost.hydrate`)
- **OBS Ghost: Launch Portable OBS Studio 33** (`obsGhost.launch`)
- **OBS Ghost: Preview HTML5 Browser-Source Overlay (Hot-Reload)** (`obsGhost.previewOverlay`)
- **OBS Ghost: Start Recording** (`obsGhost.startRecording`)

Run tests locally (Node.js 22+):

```powershell
node --test test/*.test.mts
```

## Features

- **Zero-Installer `cas-v1` Hydration:** Resolves `obs-win64.tar.zst` (`33.0.3`), `libsectium_display`, and `b8g-ghost-abi` from `awesome-os/b8g-ghost` with SHA-256 content addressing and Keep-Last-5 pinning.
- **Portable OBS Launch Builder:** Resolves the exact portable working directory (`<installDir>/bin/64bit` on Windows) so `obs64.exe` loads all Qt/FFmpeg plugins cleanly without system installation.
- **HTML5 Browser-Source Overlay Hot-Reload:** Watch workspace HTML5 overlay files and refresh active browser sources on save.
- **Scene & Recording Control:** Launch into a target scene (`--scene`) or kick off recording (`--startrecording`) from the Command Palette or `tasks.json`.

## Contributed Commands

| Command ID | Title |
| :--- | :--- |
| `obsGhost.hydrate` | OBS Ghost: Hydrate Portable OBS Studio 33 (cas-v1) |
| `obsGhost.launch` | OBS Ghost: Launch Portable OBS Studio 33 |
| `obsGhost.previewOverlay` | OBS Ghost: Preview HTML5 Browser-Source Overlay (Hot-Reload) |
| `obsGhost.startRecording` | OBS Ghost: Start Recording |

## Task Definition (`obs-ghost`)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Launch OBS Studio 33 (Portable)",
      "type": "obs-ghost",
      "action": "launch",
      "scene": "Coding",
      "portable": true
    }
  ]
}
```

## Development & Testing

Runs directly on erasable TypeScript (`erasableSyntaxOnly: true`, `noEmit: true`) with Node 22+:

```bash
node --test test/obs-vscode.test.mts
```

## License

MIT — see [`LICENSE`](./LICENSE). Upstream OBS Studio binaries hydrated from `awesome-os/b8g-ghost @ cas-v1` remain governed by the upstream OBS Project GNU GPL-2.0-or-later license.
