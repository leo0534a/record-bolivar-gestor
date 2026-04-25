const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'atletas.db');
let db;

const ALL_TESTS = [
  "100m", "200m", "400m", 
  "4x100", "4x400", 
  "4x100 comb",
  "110m vallas", "100m vallas", "400m vallas",
  "Salto largo", "Salto triple",
  "Bala", "Jabalina", "Disco"
];

const TEST_TYPE = {
  "100m": false, "200m": false, "400m": false,
  "4x100": false, "4x400": false,
  "4x100 comb": false,
  "110m vallas": false, "100m vallas": false, "400m vallas": false,
  "Salto largo": true, "Salto triple": true,
  "Bala": true, "Jabalina": true, "Disco": true
};

function initDatabase() {
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS atletas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      fecha_nacimiento TEXT,
      edad INTEGER,
      club TEXT,
      liga TEXT
    );
    CREATE TABLE IF NOT EXISTS inscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER,
      test_name TEXT,
      FOREIGN KEY(athlete_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE(athlete_id, test_name)
    );
    CREATE TABLE IF NOT EXISTS resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER,
      test_name TEXT,
      valor REAL,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(athlete_id) REFERENCES atletas(id) ON DELETE CASCADE,
      UNIQUE(athlete_id, test_name)
    );
  `);
}

function insertAthlete(athlete) {
  const { nombre, fecha_nacimiento, edad, club, liga } = athlete;
  const stmt = db.prepare(`INSERT INTO atletas (nombre, fecha_nacimiento, edad, club, liga)
                           VALUES (?, ?, ?, ?, ?)`);
  const info = stmt.run(nombre, fecha_nacimiento || null, edad || null, club || null, liga || null);
  return info.lastInsertRowid;
}

function insertRegistrations(athleteId, tests) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO inscripciones (athlete_id, test_name) VALUES (?, ?)`);
  const insertMany = db.transaction((tests) => {
    for (const test of tests) stmt.run(athleteId, test);
  });
  insertMany(tests);
}

function getAthletes() {
  return db.prepare(`SELECT * FROM atletas ORDER BY id DESC`).all();
}

function getRegistrationsWithAthletes() {
  return db.prepare(`SELECT i.athlete_id, i.test_name, a.nombre
                     FROM inscripciones i
                     JOIN atletas a ON i.athlete_id = a.id`).all();
}

function recordResult(athleteId, testName, value) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO resultados (athlete_id, test_name, valor) VALUES (?, ?, ?)`);
  stmt.run(athleteId, testName, value);
}

function getResultsByTest() {
  return db.prepare(`SELECT r.*, a.nombre as athlete_name, a.club
                     FROM resultados r 
                     JOIN atletas a ON r.athlete_id = a.id
                     ORDER BY r.test_name, r.valor`).all();
}

function getAllTests() {
  return ALL_TESTS;
}

function getAthleteTests(athleteId) {
  const rows = db.prepare(`SELECT test_name FROM inscripciones WHERE athlete_id = ?`).all(athleteId);
  return rows.map(r => r.test_name);
}

function getTopRankings() {
  const results = getResultsByTest();
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

function getBestMarks() {
  const results = getResultsByTest();
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

function deleteAthlete(athleteId) {
  db.prepare(`DELETE FROM atletas WHERE id = ?`).run(athleteId);
}

function updateAthlete(athleteId, data) {
  const { nombre, edad, club, liga } = data;
  db.prepare(`UPDATE atletas SET nombre = ?, edad = ?, club = ?, liga = ? WHERE id = ?`)
    .run(nombre, edad || null, club || null, liga || null, athleteId);
}

function replaceRegistrations(athleteId, newTests) {
  db.prepare(`DELETE FROM inscripciones WHERE athlete_id = ?`).run(athleteId);
  const stmt = db.prepare(`INSERT INTO inscripciones (athlete_id, test_name) VALUES (?, ?)`);
  const insertMany = db.transaction((tests) => {
    for (const test of tests) stmt.run(athleteId, test);
  });
  insertMany(newTests);
}

function getAthleteById(athleteId) {
  return db.prepare(`SELECT * FROM atletas WHERE id = ?`).get(athleteId);
}

function clearAllData() {
  db.exec(`DELETE FROM resultados; DELETE FROM inscripciones; DELETE FROM atletas;`);
}

function getAthletesWithResults() {
  return db.prepare(`
    SELECT a.id, a.nombre, a.edad, a.club, a.liga, r.test_name, r.valor
    FROM atletas a
    LEFT JOIN resultados r ON a.id = r.athlete_id
    ORDER BY a.id DESC, r.test_name
  `).all();
}

function getCurrentResult(athleteId, testName) {
  const row = db.prepare(`SELECT valor FROM resultados WHERE athlete_id = ? AND test_name = ?`).get(athleteId, testName);
  return row ? row.valor : null;
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
  getBestMarks,
  deleteAthlete,
  updateAthlete,
  replaceRegistrations,
  getAthleteById,
  clearAllData,
  getAthletesWithResults,
  getCurrentResult,
  getResultsByTest
};