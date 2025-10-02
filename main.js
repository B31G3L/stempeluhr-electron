// main.js - Tyme - Moderne Zeiterfassung
const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let mainWindow = null;
let currentSession = null;
let isPaused = false;
let pauseStart = null;
let totalPauseTime = 0;
let updateInterval = null;

const dataFile = path.join(app.getPath('userData'), 'timetracker.json');
const backupDir = path.join(app.getPath('userData'), 'backups');

// Auto-Start beim Login aktivieren
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
  name: 'Tyme'
});

// Daten laden mit Fehlerhandling
function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      console.log('✅ Daten erfolgreich geladen');
      return data;
    }
  } catch (error) {
    console.error('❌ Fehler beim Laden der Daten:', error);
    
    // Backup erstellen, falls Datei korrupt ist
    if (fs.existsSync(dataFile)) {
      const backupFile = path.join(app.getPath('userData'), 'timetracker.json.backup');
      try {
        fs.copyFileSync(dataFile, backupFile);
        console.log('📦 Backup erstellt:', backupFile);
      } catch (backupError) {
        console.error('❌ Backup fehlgeschlagen:', backupError);
      }
    }
  }
  
  return { sessions: [], settings: { notifyOnHour: true } };
}

// Daten speichern mit Fehlerhandling
function saveData(data) {
  try {
    // Sicherstellen, dass das Verzeichnis existiert
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log('💾 Daten gespeichert');
  } catch (error) {
    console.error('❌ Fehler beim Speichern:', error);
    
    // Benachrichtigung bei Speicherfehler
    if (Notification.isSupported()) {
      new Notification({
        title: 'Speicherfehler',
        body: 'Zeitdaten konnten nicht gespeichert werden!',
        urgency: 'critical'
      }).show();
    }
  }
}

// Backup erstellen (täglich)
function createBackup() {
  try {
    const data = loadData();
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const date = new Date().toISOString().split('T')[0];
    const backupFile = path.join(backupDir, `backup-${date}.json`);
    
    // Nur einmal pro Tag Backup erstellen
    if (!fs.existsSync(backupFile)) {
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
      console.log('📦 Backup erstellt:', backupFile);
    }
    
    // Alte Backups löschen (älter als 30 Tage)
    cleanOldBackups();
  } catch (error) {
    console.error('❌ Backup-Fehler:', error);
  }
}

// Alte Backups entfernen
function cleanOldBackups() {
  try {
    if (!fs.existsSync(backupDir)) return;
    
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > thirtyDays) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Altes Backup gelöscht:', file);
      }
    });
  } catch (error) {
    console.error('❌ Fehler beim Aufräumen der Backups:', error);
  }
}

// Benachrichtigung anzeigen
function showNotification(title, body, urgency = 'normal') {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      urgency,
      silent: false
    });
    notification.show();
  }
}

// Zeit formatieren
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// Aktuelle Arbeitszeit berechnen
function getCurrentDuration() {
  if (!currentSession) return 0;
  const now = Date.now();
  let duration = now - currentSession.start - totalPauseTime;
  if (isPaused) {
    duration -= (now - pauseStart);
  }
  return Math.max(0, duration);
}

// Tray-Icon erstellen
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'tray.png');
  
  if (fs.existsSync(iconPath)) {
    let icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 22, height: 22 });
    icon.setTemplateImage(true);
    console.log('✅ Tray Icon geladen: tray.png (22x22)');
    return icon;
  }
  
  console.log('⚠️  tray.png nicht gefunden!');
  console.log('   Erstelle das Icon mit dem Icon-Generator');
  
  // Fallback: Leeres Icon (nur Text auf macOS)
  return nativeImage.createEmpty();
}

// Tray-Menü erstellen
function createTrayMenu() {
  const data = loadData();
  const todaySessions = data.sessions.filter(s => {
    const sessionDate = new Date(s.start).toDateString();
    const today = new Date().toDateString();
    return sessionDate === today;
  });
  
  const todayTotal = todaySessions.reduce((sum, s) => sum + s.duration, 0);
  const currentDuration = getCurrentDuration();
  const displayTotal = todayTotal + currentDuration;
  
  const menuTemplate = [];
  
  // Status-Header
  if (currentSession) {
    const statusText = isPaused ? 'Pausiert' : 'Läuft';
    const statusEmoji = isPaused ? '⏸' : '▶️';
    menuTemplate.push({
      label: `${statusEmoji}  ${statusText} · ${formatDuration(currentDuration)}`,
      enabled: false
    });
  } else {
    menuTemplate.push({
      label: '⏱  Bereit zum Starten',
      enabled: false
    });
  }
  
  menuTemplate.push(
    {
      label: `Heute · ${formatDuration(displayTotal)}`,
      enabled: false
    },
    { type: 'separator' }
  );

  // Haupt-Aktionen
  if (!currentSession) {
    menuTemplate.push({
      label: 'Arbeit starten',
      click: startWork,
      accelerator: 'Command+S'
    });
  } else {
    if (!isPaused) {
      menuTemplate.push({
        label: 'Pause starten',
        click: pauseWork,
        accelerator: 'Command+P'
      });
    } else {
      menuTemplate.push({
        label: 'Pause beenden',
        click: resumeWork,
        accelerator: 'Command+P'
      });
    }
    menuTemplate.push({
      label: 'Arbeit beenden',
      click: stopWork,
      accelerator: 'Command+E'
    });
  }

  menuTemplate.push(
    { type: 'separator' },
    {
      label: 'Zeiterfassung öffnen',
      click: showWindow,
      accelerator: 'Command+O'
    },
    {
      label: 'CSV Export',
      click: exportCSV,
      accelerator: 'Command+X'
    }
  );

  // Überstunden-Info
  const allWorkdays = getWorkdaysInPeriod(data.sessions);
  const totalTime = data.sessions.reduce((sum, s) => sum + s.duration, 0);
  const overtime = calculateOvertime(totalTime, allWorkdays);
  
  if (allWorkdays > 0) {
    const overtimeSign = overtime >= 0 ? '+' : '−';
    const overtimeAbs = Math.abs(overtime);
    menuTemplate.push(
      { type: 'separator' },
      {
        label: `Überstunden · ${overtimeSign}${formatDuration(overtimeAbs)}`,
        enabled: false
      }
    );
  }

  // Auto-Start Option
  menuTemplate.push(
    { type: 'separator' },
    {
      label: 'Beim Login starten',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
          name: 'Tyme'
        });
        
        showNotification(
          'Auto-Start ' + (menuItem.checked ? 'aktiviert' : 'deaktiviert'),
          menuItem.checked 
            ? 'App startet jetzt beim Login 🚀' 
            : 'App startet nicht mehr automatisch'
        );
      }
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        if (currentSession) {
          const { dialog } = require('electron');
          const response = dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['Abbrechen', 'Zeit beenden', 'Einfach beenden'],
            defaultId: 0,
            title: 'Zeiterfassung läuft',
            message: 'Eine Zeiterfassung ist aktiv.',
            detail: 'Möchtest du die Zeit beenden oder einfach die App schließen?'
          });
          
          if (response === 0) return;
          if (response === 1) stopWork();
        }
        app.quit();
      },
      accelerator: 'Command+Q'
    }
  );

  return Menu.buildFromTemplate(menuTemplate);
}

// Hilfsfunktionen
function getWorkdaysInPeriod(sessions) {
  const uniqueDays = new Set();
  sessions.forEach(s => {
    const date = new Date(s.start);
    uniqueDays.add(date.toDateString());
  });
  return uniqueDays.size;
}

function calculateOvertime(totalMs, workdays) {
  const expectedMs = workdays * 8 * 60 * 60 * 1000; // 8h pro Tag
  return totalMs - expectedMs;
}

// CSV Export
function exportCSV() {
  const data = loadData();
  const { dialog } = require('electron');
  
  const filePath = dialog.showSaveDialogSync({
    title: 'CSV Export',
    defaultPath: `zeiterfassung-${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  
  if (filePath) {
    try {
      const csv = ['Datum,Start,Ende,Dauer (Stunden),Pausen'];
      data.sessions.forEach(s => {
        const date = new Date(s.start).toLocaleDateString('de-DE');
        const start = new Date(s.start).toLocaleTimeString('de-DE');
        const end = new Date(s.end).toLocaleTimeString('de-DE');
        const hours = (s.duration / 1000 / 60 / 60).toFixed(2);
        const pauses = s.pauses.length;
        csv.push(`${date},${start},${end},${hours},${pauses}`);
      });
      
      fs.writeFileSync(filePath, csv.join('\n'));
      showNotification('Export erfolgreich', `CSV gespeichert: ${path.basename(filePath)}`);
    } catch (error) {
      console.error('❌ Export-Fehler:', error);
      showNotification('Export fehlgeschlagen', 'CSV konnte nicht gespeichert werden', 'critical');
    }
  }
}

// Arbeit starten
function startWork() {
  currentSession = {
    start: Date.now(),
    pauses: []
  };
  isPaused = false;
  pauseStart = null;
  totalPauseTime = 0;
  updateTray();
  
  showNotification('Zeit gestartet', 'Viel Erfolg beim Arbeiten! 💪');
}

// Pause
function pauseWork() {
  if (!currentSession || isPaused) return;
  isPaused = true;
  pauseStart = Date.now();
  updateTray();
  
  showNotification('Pause gestartet', 'Gönn dir eine Erholung ☕');
}

// Pause beenden
function resumeWork() {
  if (!currentSession || !isPaused) return;
  const pauseDuration = Date.now() - pauseStart;
  currentSession.pauses.push({
    start: pauseStart,
    end: Date.now(),
    duration: pauseDuration
  });
  totalPauseTime += pauseDuration;
  isPaused = false;
  pauseStart = null;
  updateTray();
  
  showNotification('Pause beendet', 'Weiter geht\'s! 🚀');
}

// Arbeit beenden
function stopWork() {
  if (!currentSession) return;
  
  if (isPaused) {
    resumeWork();
  }
  
  const duration = getCurrentDuration();
  const data = loadData();
  const session = {
    start: currentSession.start,
    end: Date.now(),
    duration: duration,
    pauses: currentSession.pauses
  };
  
  data.sessions.push(session);
  saveData(data);
  
  currentSession = null;
  isPaused = false;
  pauseStart = null;
  totalPauseTime = 0;
  updateTray();
  
  // Backup erstellen
  createBackup();
  
  // Erfolgsbenachrichtigung
  showNotification(
    'Zeit beendet', 
    `Gearbeitet: ${formatDuration(duration)} ✅`
  );
  
  // Fenster aktualisieren falls offen
  if (mainWindow) {
    mainWindow.webContents.send('data-updated');
  }
}

// Tray aktualisieren
function updateTray() {
  if (tray) {
    tray.setContextMenu(createTrayMenu());
    
    // Tooltip aktualisieren
    if (currentSession) {
      const status = isPaused ? '⏸️ Pausiert' : '▶️ Läuft';
      tray.setToolTip(`Tyme - ${status} - ${formatDuration(getCurrentDuration())}`);
    } else {
      tray.setToolTip('Tyme - Bereit');
    }
  }
}

// Fenster anzeigen
function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 1456,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Tyme - Zeiterfassung',
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // DevTools nur in Development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// App-Start
app.whenReady().then(() => {
  console.log('🚀 Tyme startet...');
  
  // Benachrichtigungen aktivieren
  if (process.platform === 'darwin') {
    app.setName('Tyme');
  }
  
  // Tray erstellen
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Tyme');
  tray.setContextMenu(createTrayMenu());
  
  // Doppelklick auf Tray öffnet Fenster
  tray.on('double-click', showWindow);

  // Update-Intervall starten (jede Sekunde)
  updateInterval = setInterval(() => {
    if (currentSession) {
      updateTray();
    }
  }, 1000);
  
  // Tägliches Backup (jeden Tag um Mitternacht)
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      createBackup();
    }
  }, 60000); // Jede Minute checken
  
  // Erstes Backup bei Start
  createBackup();
  
  console.log('✅ Tyme läuft!');
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (updateInterval) clearInterval(updateInterval);
  
  // Warnung wenn Session läuft
  if (currentSession && !isPaused) {
    console.log('⚠️  Session läuft noch beim Beenden!');
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// === IPC-Handler ===

ipcMain.handle('get-sessions', () => {
  return loadData();
});

ipcMain.handle('delete-session', (event, index) => {
  const data = loadData();
  const deleted = data.sessions.splice(index, 1)[0];
  saveData(data);
  
  showNotification('Eintrag gelöscht', 
    `${new Date(deleted.start).toLocaleDateString('de-DE')} entfernt`);
  
  return data;
});

ipcMain.handle('get-current-session', () => {
  return {
    active: currentSession !== null,
    isPaused: isPaused,
    duration: getCurrentDuration(),
    start: currentSession?.start || null
  };
});

ipcMain.handle('start-work', () => {
  startWork();
  return { success: true };
});

ipcMain.handle('toggle-pause', () => {
  if (isPaused) {
    resumeWork();
  } else {
    pauseWork();
  }
  return { success: true };
});

ipcMain.handle('stop-work', () => {
  stopWork();
  return { success: true };
});

ipcMain.handle('add-session', (event, session) => {
  const data = loadData();
  data.sessions.push(session);
  saveData(data);
  
  showNotification('Eintrag erstellt', 
    `${new Date(session.start).toLocaleDateString('de-DE')} hinzugefügt`);
  
  return data;
});

ipcMain.handle('update-session', (event, index, session) => {
  const data = loadData();
  data.sessions[index] = session;
  saveData(data);
  
  showNotification('Eintrag aktualisiert', 
    `${new Date(session.start).toLocaleDateString('de-DE')} geändert`);
  
  return data;
});