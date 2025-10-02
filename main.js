// main.js - Verbesserte Hauptdatei
const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require('electron');
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

// Daten laden
function loadData() {
  if (fs.existsSync(dataFile)) {
    try {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (error) {
      console.error('Fehler beim Laden der Daten:', error);
      return { sessions: [], settings: { notifyOnHour: true } };
    }
  }
  return { sessions: [], settings: { notifyOnHour: true } };
}

// Daten speichern
function saveData(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
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

// Tray-Icon erstellen für macOS
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'tray.png');
  
  // Versuche das Icon zu laden
  if (fs.existsSync(iconPath)) {
    let icon = nativeImage.createFromPath(iconPath);
    
    // Größe auf 22x22 (Standard macOS Tray) anpassen
    icon = icon.resize({ width: 22, height: 22 });
    
    // Für macOS: Template Mode aktivieren
    icon.setTemplateImage(true);
    
    console.log('✅ Tray Icon geladen und skaliert: tray.png (22x22)');
    return icon;
  }
  
  console.log('⚠️  tray.png nicht gefunden!');
  console.log('   Speichere dein Icon als "tray.png" im Projektordner neben main.js');
  
  // Fallback: Leeres Icon
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

  menuTemplate.push(
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

// Hilfsfunktion für Überstunden-Berechnung
function getWorkdaysInPeriod(sessions) {
  const uniqueDays = new Set();
  sessions.forEach(s => {
    const date = new Date(s.start);
    uniqueDays.add(date.toDateString());
  });
  return uniqueDays.size;
}

function calculateOvertime(totalMs, workdays) {
  const expectedMs = workdays * 8 * 60 * 60 * 1000;
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
}

// Pause
function pauseWork() {
  if (!currentSession || isPaused) return;
  isPaused = true;
  pauseStart = Date.now();
  updateTray();
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
}

// Arbeit beenden
function stopWork() {
  if (!currentSession) return;
  
  if (isPaused) {
    resumeWork();
  }
  
  const data = loadData();
  const session = {
    start: currentSession.start,
    end: Date.now(),
    duration: getCurrentDuration(),
    pauses: currentSession.pauses
  };
  
  data.sessions.push(session);
  saveData(data);
  
  currentSession = null;
  isPaused = false;
  pauseStart = null;
  totalPauseTime = 0;
  updateTray();
  
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
      tray.setToolTip(`Stempeluhr - ${status} - ${formatDuration(getCurrentDuration())}`);
    } else {
      tray.setToolTip('Stempeluhr - Bereit');
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
    height: 1456, // Goldener Schnitt: 900 * 1.618
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Stempeluhr - Zeiterfassung'
  });

  mainWindow.loadFile('index.html');
  
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
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Stempeluhr');
  tray.setContextMenu(createTrayMenu());
  
  // Doppelklick auf Tray öffnet Fenster
  tray.on('double-click', showWindow);

  // Update-Intervall starten
  updateInterval = setInterval(() => {
    if (currentSession) {
      updateTray();
    }
  }, 1000);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (updateInterval) clearInterval(updateInterval);
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// IPC-Handler
ipcMain.handle('get-sessions', () => {
  return loadData();
});

ipcMain.handle('delete-session', (event, index) => {
  const data = loadData();
  data.sessions.splice(index, 1);
  saveData(data);
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
  return data;
});

ipcMain.handle('update-session', (event, index, session) => {
  const data = loadData();
  data.sessions[index] = session;
  saveData(data);
  return data;
});