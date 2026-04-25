const sqlite3 = require('sqlite3').verbose();
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
      function(err) { if (err) reject(err); else resolve(this.lastID); });
  });
}

function insertRegistrations(athleteId, tests) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT OR IGNORE INTO inscripciones (athlete_id, test_name) VALUES (?, ?)`);
    tests.forEach(test => stmt.run(athleteId, test));
    stmt.finalize(err => { if (err) reject(err); else resolve(); });
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

function getAthleteTests(athleteId) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT test_name FROM inscripciones WHERE athlete_id = ?`, [athleteId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.test_name));
    });
  });
}

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

function deleteAthlete(athleteId) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM atletas WHERE id = ?`, [athleteId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function updateAthlete(athleteId, data) {
  return new Promise((resolve, reject) => {
    const { nombre, edad, club, liga } = data;
    db.run(`UPDATE atletas SET nombre = ?, edad = ?, club = ?, liga = ? WHERE id = ?`,
      [nombre, edad || null, club || null, liga || null, athleteId], (err) => {
        if (err) reject(err);
        else resolve();
      });
  });
}

function replaceRegistrations(athleteId, newTests) {
  return new Promise(async (resolve, reject) => {
    try {
      await new Promise((res, rej) => {
        db.run(`DELETE FROM inscripciones WHERE athlete_id = ?`, [athleteId], (err) => {
          if (err) rej(err); else res();
        });
      });
      const stmt = db.prepare(`INSERT INTO inscripciones (athlete_id, test_name) VALUES (?, ?)`);
      for (const test of newTests) {
        await new Promise((res, rej) => {
          stmt.run(athleteId, test, (err) => { if (err) rej(err); else res(); });
        });
      }
      stmt.finalize((err) => {
        if (err) reject(err); else resolve();
      });
    } catch (err) { reject(err); }
  });
}

function getAthleteById(athleteId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM atletas WHERE id = ?`, [athleteId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function clearAllData() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`DELETE FROM resultados`, (err) => { if (err) reject(err); });
      db.run(`DELETE FROM inscripciones`, (err) => { if (err) reject(err); });
      db.run(`DELETE FROM atletas`, (err) => { if (err) reject(err); else resolve(); });
    });
  });
}

function getAthletesWithResults() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        a.id,
        a.nombre,
        a.edad,
        a.club,
        a.liga,
        r.test_name,
        r.valor
      FROM atletas a
      LEFT JOIN resultados r ON a.id = r.athlete_id
      ORDER BY a.id DESC, r.test_name
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getCurrentResult(athleteId, testName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT valor FROM resultados WHERE athlete_id = ? AND test_name = ?`, [athleteId, testName], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.valor : null);
    });
  });
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