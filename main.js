// main.js - Hauptdatei für die Electron-App
const { app, Tray, Menu, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let mainWindow = null;
let currentSession = null;
let isPaused = false;
let pauseStart = null;
let totalPauseTime = 0;

const dataFile = path.join(app.getPath('userData'), 'timetracker.json');

// Daten laden
function loadData() {
  if (fs.existsSync(dataFile)) {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  }
  return { sessions: [] };
}

// Daten speichern
function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// Zeit formatieren
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
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

// Tray-Menü erstellen
function createTrayMenu() {
  const data = loadData();
  const todaySessions = data.sessions.filter(s => {
    const sessionDate = new Date(s.start).toDateString();
    const today = new Date().toDateString();
    return sessionDate === today;
  });
  
  const todayTotal = todaySessions.reduce((sum, s) => sum + s.duration, 0);
  
  const menuTemplate = [
    {
      label: currentSession 
        ? `⏱️ Läuft: ${formatDuration(getCurrentDuration())}`
        : '⏱️ Nicht gestartet',
      enabled: false
    },
    {
      label: `📊 Heute gesamt: ${formatDuration(todayTotal + (currentSession ? getCurrentDuration() : 0))}`,
      enabled: false
    },
    { type: 'separator' },
  ];

  if (!currentSession) {
    menuTemplate.push({
      label: '▶️ Arbeit starten',
      click: startWork
    });
  } else {
    if (!isPaused) {
      menuTemplate.push({
        label: '⏸️ Pause',
        click: pauseWork
      });
    } else {
      menuTemplate.push({
        label: '▶️ Pause beenden',
        click: resumeWork
      });
    }
    menuTemplate.push({
      label: '⏹️ Arbeit beenden',
      click: stopWork
    });
  }

  menuTemplate.push(
    { type: 'separator' },
    {
      label: '📋 Zeiten anzeigen',
      click: showWindow
    },
    { type: 'separator' },
    {
      label: '🚪 Beenden',
      click: () => app.quit()
    }
  );

  return Menu.buildFromTemplate(menuTemplate);
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
    resumeWork(); // Pause erst beenden
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
}

// Tray aktualisieren
function updateTray() {
  if (tray) {
    tray.setContextMenu(createTrayMenu());
    
    // Tooltip aktualisieren
    if (currentSession) {
      tray.setToolTip(`Stempeluhr - ${formatDuration(getCurrentDuration())}`);
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
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
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
  // Tray-Icon erstellen (verwende ein Standard-Icon oder erstelle eins)
  const iconPath = process.platform === 'darwin' 
    ? path.join(__dirname, 'icon.png')  // Für Mac
    : path.join(__dirname, 'icon.png'); // Für Windows
  
  tray = new Tray(iconPath);
  tray.setToolTip('Stempeluhr');
  tray.setContextMenu(createTrayMenu());

  // Regelmäßiges Update (jede Sekunde)
  setInterval(() => {
    if (currentSession) {
      updateTray();
    }
  }, 1000);
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// IPC-Handler für das Fenster
ipcMain.handle('get-sessions', () => {
  return loadData();
});

ipcMain.handle('delete-session', (event, index) => {
  const data = loadData();
  data.sessions.splice(index, 1);
  saveData(data);
  return data;
});