# Stempeluhr ⏱️

Einfache, elegante Zeiterfassungs-App mit Tray-Icon für macOS und Windows.

![Stempeluhr Screenshot](https://via.placeholder.com/800x500?text=Stempeluhr+App)

## ✨ Features

- ⏰ **Start/Stop Zeiterfassung** - Einfach per Klick
- ⏸️ **Pause-Funktion** - Unterbrechungen werden berücksichtigt
- 📊 **Statistiken** - Tages-, Wochen- und Gesamtübersicht
- 📈 **Überstunden-Tracking** - Automatisch basierend auf 8h/Tag
- 💾 **Lokale Datenspeicherung** - Deine Daten bleiben privat
- 🌙 **Dark Mode** - Augenschonend arbeiten
- 📤 **CSV-Export** - Für Buchhaltung & Weiterverarbeitung
- 🎨 **Modernes Design** - Google Material Design inspiriert

## 🚀 Installation

### Voraussetzungen
- Node.js (Version 14 oder höher)
- npm (kommt mit Node.js)

### Schritt-für-Schritt

1. **Projekt klonen oder herunterladen**
   ```bash
   git clone https://github.com/deinname/stempeluhr.git
   cd stempeluhr
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Icons erstellen**
   - Öffne die `icon-generator.html` im Browser
   - Lade `tray.png` und `icon.png` herunter
   - Speichere beide im Projektordner

4. **App starten**
   ```bash
   npm start
   ```

## 📦 Build für Production

### macOS App erstellen
```bash
npm run build:mac
```
Erstellt eine `.dmg` Datei in `dist/`

### Windows App erstellen
```bash
npm run build:win
```
Erstellt einen Installer in `dist/`

### Beide Plattformen
```bash
npm run build:all
```

## 🎯 Nutzung

### Zeiterfassung starten

1. **Per Tray-Icon**
   - Klicke auf das Uhr-Icon in der Menüleiste (macOS) oder Taskleiste (Windows)
   - Wähle "Arbeit starten"
   - Der Timer läuft!

2. **Per Tastenkombination** (macOS)
   - `⌘+S` - Arbeit starten
   - `⌘+P` - Pause ein/aus
   - `⌘+E` - Arbeit beenden
   - `⌘+O` - Fenster öffnen
   - `⌘+Q` - App beenden

### Hauptfenster

Das Hauptfenster zeigt dir:
- **Aktuelle Session** - Laufende Zeit mit Start/Pause/Stop
- **Statistiken** - Heute, diese Woche, Gesamt-Überstunden
- **Letzte Einträge** - Die 3 neuesten Zeiterfassungen
- **Alle Einträge** - Vollständige Historie mit Filter

### Features im Detail

#### Pause-Funktion
- Während einer laufenden Session kannst du Pausen einlegen
- Pausenzeiten werden automatisch von der Arbeitszeit abgezogen
- Mehrere Pausen pro Session möglich

#### Überstunden-Berechnung
- Basiert auf 8 Stunden pro Arbeitstag
- Wird automatisch für Heute, Woche und Gesamt berechnet
- Grün = Überstunden, Rot = Minusstunden

#### Einträge bearbeiten
- Klicke auf das Stift-Symbol ✎ bei einem Eintrag
- Ändere Datum, Start- oder Endzeit
- Speichern - fertig!

#### CSV-Export
1. Klicke im Tray-Menü auf "CSV Export"
2. Wähle Speicherort
3. Importiere die Datei in Excel, Google Sheets, etc.

## 📂 Datenstruktur

Alle Daten werden lokal gespeichert in:

**macOS:**
```
~/Library/Application Support/stempeluhr/timetracker.json
```

**Windows:**
```
%APPDATA%/stempeluhr/timetracker.json
```

### JSON-Format
```json
{
  "sessions": [
    {
      "start": 1696233600000,
      "end": 1696262400000,
      "duration": 28800000,
      "pauses": [
        {
          "start": 1696248000000,
          "end": 1696249800000,
          "duration": 1800000
        }
      ]
    }
  ],
  "settings": {
    "notifyOnHour": true
  }
}
```

## 🎨 Anpassungen

### Sollstunden ändern

Standardmäßig sind 8 Stunden pro Tag eingestellt. Um dies zu ändern:

```javascript
// In main.js, Zeile ~180
function calculateOvertime(totalMs, workdays) {
  const expectedMs = workdays * 8 * 60 * 60 * 1000; // Hier 8 ändern
  return totalMs - expectedMs;
}
```

### Design anpassen

Die Farben können in `index.html` geändert werden:

```css
/* Primärfarbe */
.control-btn.primary {
  background: #1a73e8; /* Blau → deine Farbe */
}

/* Akzentfarbe */
.control-btn.secondary {
  background: #f9ab00; /* Orange → deine Farbe */
}
```

## 🐛 Troubleshooting

### App startet nicht

**Problem:** "tray.png not found"
- **Lösung:** Icons mit dem Icon-Generator erstellen

**Problem:** "Cannot find module electron"
- **Lösung:** `npm install` ausführen

### Tray-Icon wird nicht angezeigt (macOS)

**Problem:** Icon ist unsichtbar
- **Lösung:** Stelle sicher, dass `tray.png` 22x22px oder 44x44px ist

### Daten gehen verloren

**Problem:** Nach App-Update sind Sessions weg
- **Lösung:** Backup erstellen:
  ```bash
  # macOS
  cp ~/Library/Application\ Support/stempeluhr/timetracker.json ~/Desktop/
  
  # Windows
  copy %APPDATA%\stempeluhr\timetracker.json %USERPROFILE%\Desktop\
  ```

## 🔒 Datenschutz

- ✅ Alle Daten werden **nur lokal** gespeichert
- ✅ **Keine Cloud-Synchronisation**
- ✅ **Keine Telemetrie** oder Tracking
- ✅ **Open Source** - du kannst den Code einsehen

## 🤝 Beitragen

Contributions sind willkommen!

1. Fork das Projekt
2. Erstelle einen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit deine Änderungen (`git commit -m 'Add AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## 📝 To-Do / Roadmap

- [ ] Automatische Backups
- [ ] Benachrichtigungen (Desktop Notifications)
- [ ] Cloud-Sync (optional)
- [ ] Verschiedene Projekte/Kategorien
- [ ] Berichte & Diagramme
- [ ] Mobile App (Companion)
- [ ] Auto-Start beim Login
- [ ] Multi-Language Support

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei

## 👨‍💻 Autor

**Dein Name**
- GitHub: [@deinname](https://github.com/deinname)
- Website: [deine-website.de](https://deine-website.de)

## 🙏 Danksagung

- Electron Team für das großartige Framework
- Google Material Design für die Design-Inspiration
- Alle Contributors

---

**Viel Erfolg beim Zeiterfassen! ⏱️**

Bei Fragen oder Problemen, öffne ein [Issue](https://github.com/deinname/stempeluhr/issues).