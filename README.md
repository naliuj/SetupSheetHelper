# Setup Sheet Helper

> **⚠️ AI-assisted project.** This codebase was built with substantial AI assistance (Claude Code, by Anthropic) — most of the implementation, and a good share of the architecture decisions, were written by AI under my direction and review, not hand-written line by line. I've tested it and use it myself, but if you're evaluating this code, reading it as a reference, or considering using it, please factor that in rather than assuming it reflects unassisted human authorship throughout.

A desktop app for planning studio session setup sheets — mic/preamp/outboard assignments, channel lists, and room layouts — built for Berklee's recording studios.

## What it does

- Table Mode: build a setup sheet (source, mic, 48V, channel, tie line, notes, etc.) against a studio's gear catalogue.
- Layout Mode: lay out gear visually on a room floor plan, with a standalone pop-out window for a second monitor.
- Split View: open two setups side by side, independently editable.
- Export to PDF or XLSX; save/load reusable channel presets and studio templates.
- Manage studios, setups, and gear catalogues (mics, preamps, outboard) with folders.

## Tech stack

Electron, React, TypeScript, SQLite (`better-sqlite3`), Zustand, Konva (canvas layout), Vite.

## Development

```bash
npm install
npm run dev        # launch the app in dev mode
npm run typecheck  # tsc, no emit
npm run build      # production build (electron-vite)
```

## Releases

Built and signed macOS releases are published on this repo's [Releases](../../releases) page.
