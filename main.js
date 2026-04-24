const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initDatabase, insertAthlete, getAthletes, insertRegistrations,
        recordResult, getAllTests, getAthleteTests, getTopRankings, getBestMarks } = require('./database');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Récord Bolívar - Gestor de Atletas",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('src/index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('save-athlete', async (event, { athlete, selectedTests }) => {
  try {
    const athleteId = await insertAthlete(athlete);
    await insertRegistrations(athleteId, selectedTests);
    return { success: true, id: athleteId };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-athletes', async () => {
  const athletes = await getAthletes();
  const registrations = await getRegistrationsWithAthletes();
  const allTests = getAllTests();
  const matrix = athletes.map(athlete => {
    const athleteTests = registrations.filter(r => r.athlete_id === athlete.id).map(r => r.test_name);
    return { ...athlete, tests: athleteTests };
  });
  return { athletes: matrix, allTests };
});

ipcMain.handle('save-result', async (event, { athleteId, testName, value }) => {
  try {
    await recordResult(athleteId, testName, value);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-athlete-tests', async (event, athleteId) => {
  return await getAthleteTests(athleteId);
});

ipcMain.handle('get-top-rankings', async () => {
  return await getTopRankings();
});

ipcMain.handle('get-best-marks', async () => {
  return await getBestMarks();
});