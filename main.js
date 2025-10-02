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

app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
  name: 'Tyme'
});

function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      console.log('✅ Daten geladen');
      return data;
    }
  } catch (error) {
    console.error('❌ Ladefehler:', error);
    if (fs.existsSync(dataFile)) {
      const backupFile = path.join(app.getPath('userData'), 'timetracker.json.backup');
      try {
        fs.copyFileSync(dataFile, backupFile);
        console.log('📦 Backup erstellt');
      } catch (e) {}
    }
  }
  return { sessions: [], settings: { notifyOnHour: true } };
}

function saveData(data) {
  try {
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = dataFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, dataFile);
    console.log('💾 Daten gespeichert');
  } catch (error) {
    console.error('❌ Speicherfehler:', error);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Speicherfehler',
        body: 'Zeitdaten konnten nicht gespeichert werden!',
        urgency: 'critical'
      }).show();
    }
  }
}

function createBackup() {
  try {
    const data = loadData();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const date = new Date().toISOString().split('T')[0];
    const backupFile = path.join(backupDir, `backup-${date}.json`);
    if (!fs.existsSync(backupFile)) {
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
      console.log('📦 Backup erstellt');
    }
    cleanOldBackups();
  } catch (error) {
    console.error('❌ Backup-Fehler:', error);
  }
}

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
        console.log('🗑️ Altes Backup gelöscht');
      }
    });
  } catch (error) {}
}

function showNotification(title, body, urgency = 'normal') {
  if (Notification.isSupported()) {
    new Notification({ title, body, urgency, silent: false }).show();
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getCurrentDuration() {
  if (!currentSession) return 0;
  const now = Date.now();
  let duration = now - currentSession.start - totalPauseTime;
  if (isPaused) {
    duration -= (now - pauseStart);
  }
  return Math.max(0, duration);
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, 'tray.png');
  if (fs.existsSync(iconPath)) {
    let icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 22, height: 22 });
    icon.setTemplateImage(true);
    console.log('✅ Tray Icon geladen');
    return icon;
  }
  console.log('⚠️  tray.png nicht gefunden! Nutze icon-generator.html');
  return nativeImage.createEmpty();
}

const isMac = process.platform === 'darwin';
const modifier = isMac ? 'Command' : 'Ctrl';

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
    { label: `Heute · ${formatDuration(displayTotal)}`, enabled: false },
    { type: 'separator' }
  );

  if (!currentSession) {
    menuTemplate.push({
      label: 'Arbeit starten',
      click: startWork,
      accelerator: `${modifier}+S`
    });
  } else {
    if (!isPaused) {
      menuTemplate.push({
        label: 'Pause starten',
        click: pauseWork,
        accelerator: `${modifier}+P`
      });
    } else {
      menuTemplate.push({
        label: 'Pause beenden',
        click: resumeWork,
        accelerator: `${modifier}+P`
      });
    }
    menuTemplate.push({
      label: 'Arbeit beenden',
      click: stopWork,
      accelerator: `${modifier}+E`
    });
  }

  menuTemplate.push(
    { type: 'separator' },
    {
      label: 'Zeiterfassung öffnen',
      click: showWindow,
      accelerator: `${modifier}+O`
    },
    {
      label: 'CSV Export',
      click: exportCSV,
      accelerator: `${modifier}+X`
    }
  );

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
          menuItem.checked ? 'App startet beim Login 🚀' : 'Kein Auto-Start mehr'
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
            detail: 'Möchtest du die Zeit beenden?'
          });
          if (response === 0) return;
          if (response === 1) stopWork();
        }
        app.quit();
      },
      accelerator: `${modifier}+Q`
    }
  );

  return Menu.buildFromTemplate(menuTemplate);
}

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
      showNotification('Export erfolgreich', `CSV gespeichert`);
    } catch (error) {
      showNotification('Export fehlgeschlagen', 'Fehler', 'critical');
    }
  }
}

function startWork() {
  currentSession = { start: Date.now(), pauses: [] };
  isPaused = false;
  pauseStart = null;
  totalPauseTime = 0;
  updateTray();
  showNotification('Zeit gestartet', 'Viel Erfolg! 💪');
}

function pauseWork() {
  if (!currentSession || isPaused) return;
  isPaused = true;
  pauseStart = Date.now();
  updateTray();
  showNotification('Pause gestartet', 'Gönn dir eine Erholung ☕');
}

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

function stopWork() {
  if (!currentSession) return;
  if (isPaused) resumeWork();
  
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
  createBackup();
  
  showNotification('Zeit beendet', `Gearbeitet: ${formatDuration(duration)} ✅`);
  
  if (mainWindow) {
    mainWindow.webContents.send('data-updated');
  }
}

function updateTray() {
  if (tray) {
    tray.setContextMenu(createTrayMenu());
    if (currentSession) {
      const status = isPaused ? '⏸️ Pausiert' : '▶️ Läuft';
      tray.setToolTip(`Tyme - ${status} - ${formatDuration(getCurrentDuration())}`);
    } else {
      tray.setToolTip('Tyme - Bereit');
    }
  }
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Tyme - Zeiterfassung',
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  console.log('🚀 Tyme startet...');
  if (process.platform === 'darwin') app.setName('Tyme');
  
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Tyme');
  tray.setContextMenu(createTrayMenu());
  tray.on('double-click', showWindow);

  updateInterval = setInterval(() => {
    if (currentSession && !isPaused) updateTray();
  }, 1000);
  
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) createBackup();
  }, 60000);
  
  createBackup();
  console.log('✅ Tyme läuft!');
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (updateInterval) clearInterval(updateInterval);
});

app.on('window-all-closed', (e) => e.preventDefault());

// IPC Handler
ipcMain.handle('get-sessions', () => loadData());

ipcMain.handle('delete-session', (event, index) => {
  const data = loadData();
  const deleted = data.sessions.splice(index, 1)[0];
  saveData(data);
  showNotification('Eintrag gelöscht', `${new Date(deleted.start).toLocaleDateString('de-DE')} entfernt`);
  return data;
});

ipcMain.handle('get-current-session', () => ({
  active: currentSession !== null,
  isPaused: isPaused,
  duration: getCurrentDuration(),
  start: currentSession?.start || null
}));

ipcMain.handle('start-work', () => { startWork(); return { success: true }; });

ipcMain.handle('toggle-pause', () => {
  isPaused ? resumeWork() : pauseWork();
  return { success: true };
});

ipcMain.handle('stop-work', () => { stopWork(); return { success: true }; });

ipcMain.handle('add-session', (event, session) => {
  const data = loadData();
  data.sessions.push(session);
  saveData(data);
  showNotification('Eintrag erstellt', `${new Date(session.start).toLocaleDateString('de-DE')} hinzugefügt`);
  return data;
});

ipcMain.handle('update-session', (event, index, session) => {
  const data = loadData();
  data.sessions[index] = session;
  saveData(data);
  showNotification('Eintrag aktualisiert', `${new Date(session.start).toLocaleDateString('de-DE')} geändert`);
  return data;
});