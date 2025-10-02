# Tyme ⏱️

Moderne Zeiterfassungs-App mit Tray-Icon für macOS und Windows.

## Features

- ⏰ Start/Stop Zeiterfassung
- ⏸️ Pause-Funktion
- 📊 Tages-, Wochen- und Gesamt-Statistiken
- 📈 Automatisches Überstunden-Tracking (8h/Tag)
- 💾 Lokale Datenspeicherung
- 🌙 Dark Mode
- 📤 CSV-Export
- 🎨 Google Material Design

## Installation

1. **Dependencies installieren:**
   ```bash
   npm install
   ```

2. **Icons erstellen:**
   - Öffne `icon-generator.html` im Browser
   - Lade `icon.png` und `tray.png` herunter
   - Speichere beide im Projektordner

3. **App starten:**
   ```bash
   npm start
   ```

## Build

- **macOS:** `npm run build:mac`
- **Windows:** `npm run build:win`
- **Beide:** `npm run build:all`

## Shortcuts

- **macOS:** `⌘+S` Starten | `⌘+P` Pause | `⌘+E` Beenden
- **Windows:** `Ctrl+S` Starten | `Ctrl+P` Pause | `Ctrl+E` Beenden

## Datenspeicherung

- **macOS:** `~/Library/Application Support/tyme/timetracker.json`
- **Windows:** `%APPDATA%/tyme/timetracker.json`

## Lizenz

MIT