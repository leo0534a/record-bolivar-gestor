const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'atletas.db');
let db;

// Lista completa de pruebas
const ALL_TESTS = [
  "100m", "200m", "400m", 
  "4x100", "4x400", 
  "4x100 comb",
  "110m vallas", "100m vallas", "400m vallas",
  "Salto largo", "Salto triple",
  "Bala", "Jabalina", "Disco"
];

// Tipo de prueba: true = mayor mejor (saltos/lanzamientos), false = menor mejor (carreras/vallas)
const TEST_TYPE = {
  "100m": false, "200m": false, "400m": false,
  "4x100": false, "4x400": false,
  "4x100 comb": false,
  "110m vallas": false, "100m vallas": false, "400m vallas": false,
  "Salto largo": true, "Salto triple": true,
  "Bala": true, "Jabalina": true, "Disco": true
};

function initDatabase() {
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS atletas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      fecha_nacimiento TEXT,
      edad INTEGER,
      club TEXT,
      liga TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER,
      test_name TEXT,
      FOREIGN KEY(athlete_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE(athlete_id, test_name)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER,
      test_name TEXT,
      valor REAL,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(athlete_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE(athlete_id, test_name)
    )`);
  });
}

function insertAthlete(athlete) {
  return new Promise((resolve, reject) => {
    const { nombre, fecha_nacimiento, edad, club, liga } = athlete;
    db.run(`INSERT INTO atletas (nombre, fecha_nacimiento, edad, club, liga)
            VALUES (?,?,?,?,?)`,
      [nombre, fecha_nacimiento || null, edad || null, club || null, liga || null],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
  });
}

function insertRegistrations(athleteId, tests) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT OR IGNORE INTO inscripciones (athlete_id, test_name) VALUES (?, ?)`);
    tests.forEach(test => stmt.run(athleteId, test));
    stmt.finalize(err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getAthletes() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM atletas ORDER BY id DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRegistrationsWithAthletes() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT i.athlete_id, i.test_name, a.nombre
            FROM inscripciones i
            JOIN atletas a ON i.athlete_id = a.id`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function recordResult(athleteId, testName, value) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT OR REPLACE INTO resultados (athlete_id, test_name, valor)
            VALUES (?,?,?)`, [athleteId, testName, value], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getResultsByTest() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT r.*, a.nombre as athlete_name, a.club
            FROM resultados r 
            JOIN atletas a ON r.athlete_id = a.id
            ORDER BY r.test_name, r.valor`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAllTests() {
  return ALL_TESTS;
}

// Obtener las pruebas en las que está inscrito un atleta específico
function getAthleteTests(athleteId) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT test_name FROM inscripciones WHERE athlete_id = ?`, [athleteId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.test_name));
    });
  });
}

// Obtener top 3 por cada prueba (para dashboard)
async function getTopRankings() {
  const results = await getResultsByTest();
  const topRankings = {};
  for (const test of ALL_TESTS) {
    const testResults = results.filter(r => r.test_name === test);
    if (testResults.length === 0) {
      topRankings[test] = [];
      continue;
    }
    const sorted = [...testResults].sort((a,b) => {
      if (TEST_TYPE[test]) return b.valor - a.valor;
      else return a.valor - b.valor;
    });
    topRankings[test] = sorted.slice(0, 3).map(r => ({
      athlete_name: r.athlete_name,
      club: r.club,
      value: r.valor,
      date: r.fecha_registro
    }));
  }
  return topRankings;
}

// Para el dashboard de mejores marcas (gráfico de barras)
async function getBestMarks() {
  const results = await getResultsByTest();
  const bestMarks = [];
  for (const test of ALL_TESTS) {
    const testResults = results.filter(r => r.test_name === test);
    if (testResults.length === 0) {
      bestMarks.push({ test, bestValue: null });
      continue;
    }
    const sorted = [...testResults].sort((a,b) => {
      if (TEST_TYPE[test]) return b.valor - a.valor;
      else return a.valor - b.valor;
    });
    bestMarks.push({ test, bestValue: sorted[0].valor });
  }
  return bestMarks;
}

module.exports = {
  initDatabase,
  insertAthlete,
  getAthletes,
  insertRegistrations,
  getRegistrationsWithAthletes,
  recordResult,
  getAllTests,
  getAthleteTests,
  getTopRankings,
  getBestMarks
};