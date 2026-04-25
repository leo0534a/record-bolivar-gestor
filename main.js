const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  initDatabase, insertAthlete, getAthletes, insertRegistrations,
  recordResult, getAllTests, getAthleteTests, getTopRankings, getBestMarks,
  getRegistrationsWithAthletes, deleteAthlete, updateAthlete,
  replaceRegistrations, getAthleteById, clearAllData,
  getAthletesWithResults, getCurrentResult, getResultsByTest
} = require('./database');

let mainWindow;

app.disableHardwareAcceleration();

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

// ========== HANDLERS ==========
ipcMain.handle('save-athlete', async (event, { athlete, selectedTests }) => {
  try {
    const athleteId = await insertAthlete(athlete);
    await insertRegistrations(athleteId, selectedTests);
    return { success: true, id: athleteId };
  } catch (error) {
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

ipcMain.handle('delete-athlete', async (event, athleteId) => {
  try {
    await deleteAthlete(athleteId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-athlete', async (event, { athleteId, athleteData, selectedTests }) => {
  try {
    await updateAthlete(athleteId, athleteData);
    if (selectedTests) await replaceRegistrations(athleteId, selectedTests);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-athlete-by-id', async (event, athleteId) => {
  const athlete = await getAthleteById(athleteId);
  const tests = await getAthleteTests(athleteId);
  return { athlete, tests };
});

ipcMain.handle('clear-all-data', async () => {
  try {
    await clearAllData();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-athletes-with-results', async () => {
  return await getAthletesWithResults();
});

ipcMain.handle('get-current-result', async (event, athleteId, testName) => {
  return await getCurrentResult(athleteId, testName);
});

ipcMain.handle('get-current-results-for-athlete', async (event, athleteId) => {
  const allResults = await getResultsByTest();
  const athleteResults = allResults.filter(r => r.athlete_id === athleteId);
  const map = {};
  athleteResults.forEach(r => { map[r.test_name] = r.valor; });
  return map;
});

// ========== EXPORTAR A EXCEL ==========
ipcMain.handle('export-to-excel', async () => {
  const rows = await getAthletesWithResults();

  const athletesMap = new Map();
  for (const row of rows) {
    if (!athletesMap.has(row.id)) {
      athletesMap.set(row.id, {
        id: row.id,
        nombre: row.nombre,
        edad: row.edad || '',
        club: row.club || '',
        liga: row.liga || '',
        resultados: {}
      });
    }
    if (row.test_name && row.valor !== null) {
      athletesMap.get(row.id).resultados[row.test_name] = row.valor;
    }
  }
  const athletesList = Array.from(athletesMap.values());

  const categoriesOrder = ["Carreras Planas", "Relevos", "Relevo Comb.", "Vallas", "Saltos", "Lanzamientos"];
  const pruebasPorCategoria = {
    "Carreras Planas": ["100m", "200m", "400m"],
    "Relevos": ["4x100", "4x400"],
    "Relevo Comb.": ["4x100 comb"],
    "Vallas": ["110m vallas", "100m vallas", "400m vallas"],
    "Saltos": ["Salto largo", "Salto triple"],
    "Lanzamientos": ["Bala", "Jabalina", "Disco"]
  };

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Competidores');

  // Estilos
  const titleStyle = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center', vertical: 'middle' } };
  const subtitleStyle = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } };
  const headerInfoStyle = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };
  const headerMainStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB0C4DE' } }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };
  const headerSubStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };
  const dataStyle = { alignment: { horizontal: 'center', vertical: 'middle' }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };

  // Títulos
  worksheet.mergeCells('A1', 'N1');
  worksheet.getCell('A1').value = 'FEDERACIÓN COLOMBIANA DE ATLETISMO';
  worksheet.getCell('A1').style = titleStyle;
  worksheet.mergeCells('A2', 'N2');
  worksheet.getCell('A2').value = 'CAMPEONATO NACIONAL DE MUNICIPIOS Y CLUBES';
  worksheet.getCell('A2').style = titleStyle;
  worksheet.mergeCells('A3', 'N3');
  worksheet.getCell('A3').value = 'INFORMACIÓN DE PARTICIPANTES Y MARCAS';
  worksheet.getCell('A3').style = subtitleStyle;

  // Fila 4: "INFORMACIÓN DEL ATLETA"
  worksheet.mergeCells(4, 1, 4, 5);
  worksheet.getCell(4, 1).value = 'INFORMACIÓN DEL ATLETA';
  worksheet.getCell(4, 1).style = headerInfoStyle;

  // Fila 5: columnas base
  worksheet.getCell(5, 1).value = 'ID';
  worksheet.getCell(5, 2).value = 'Nombre';
  worksheet.getCell(5, 3).value = 'Edad';
  worksheet.getCell(5, 4).value = 'Club';
  worksheet.getCell(5, 5).value = 'Liga';
  for (let i = 1; i <= 5; i++) worksheet.getCell(5, i).style = headerSubStyle;

  // Fila 6: categorías agrupadas
  let currentCol = 6;
  for (const cat of categoriesOrder) {
    const pruebas = pruebasPorCategoria[cat];
    const span = pruebas.length;
    if (span === 0) continue;
    worksheet.mergeCells(6, currentCol, 6, currentCol + span - 1);
    worksheet.getCell(6, currentCol).value = cat;
    worksheet.getCell(6, currentCol).style = headerMainStyle;
    currentCol += span;
  }

  // Fila 7: pruebas específicas
  currentCol = 6;
  for (const cat of categoriesOrder) {
    const pruebas = pruebasPorCategoria[cat];
    for (const prueba of pruebas) {
      worksheet.getCell(7, currentCol).value = prueba;
      worksheet.getCell(7, currentCol).style = headerSubStyle;
      currentCol++;
    }
  }

  // Datos
  for (const athlete of athletesList) {
    const rowData = [athlete.id, athlete.nombre, athlete.edad, athlete.club, athlete.liga];
    for (const cat of categoriesOrder) {
      const pruebas = pruebasPorCategoria[cat];
      for (const prueba of pruebas) {
        rowData.push(athlete.resultados[prueba] !== undefined ? athlete.resultados[prueba] : '');
      }
    }
    const row = worksheet.addRow(rowData);
    row.eachCell(cell => cell.style = dataStyle);
  }

  // Ajustar ancho de columnas
  worksheet.columns.forEach(column => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const val = cell.value ? cell.value.toString() : '';
      maxLen = Math.max(maxLen, val.length);
    });
    column.width = Math.min(Math.max(maxLen + 2, 8), 30);
  });

  worksheet.getRow(4).height = 20;
  worksheet.getRow(5).height = 20;
  worksheet.getRow(6).height = 25;
  worksheet.getRow(7).height = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
});