const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'papertrail.db');

let SQL;
let db;

async function initDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  
  if (!db) {
    let data;
    if (fs.existsSync(DB_PATH)) {
      data = fs.readFileSync(DB_PATH);
    }
    
    db = new SQL.Database(data);
    initTables();
  }
  
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      actions_used INTEGER NOT NULL DEFAULT 0,
      reset_date TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(device_id),
      UNIQUE(device_id, reset_date)
    );

    CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_usage_device ON usage(device_id);
  `);
  saveDb();
}

// Get the reset date (first of current month)
function getResetDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

async function registerDevice(deviceId, token) {
  const database = await initDb();
  
  // Check if device exists
  const stmt = database.prepare('SELECT * FROM devices WHERE device_id = ?');
  const existing = stmt.getAsObject([deviceId]);
  stmt.free();
  
  if (existing.device_id) {
    return existing;
  }

  // Insert new device
  const insertStmt = database.prepare('INSERT INTO devices (device_id, token, plan) VALUES (?, ?, ?)');
  insertStmt.run([deviceId, token, 'free']);
  insertStmt.free();
  
  saveDb();
  
  // Return the new device
  const selectStmt = database.prepare('SELECT * FROM devices WHERE device_id = ?');
  const result = selectStmt.getAsObject([deviceId]);
  selectStmt.free();
  
  return result;
}

async function getDeviceByToken(token) {
  const database = await initDb();
  const stmt = database.prepare('SELECT * FROM devices WHERE token = ?');
  const result = stmt.getAsObject([token]);
  stmt.free();
  
  return result.device_id ? result : null;
}

async function getUsage(deviceId) {
  const database = await initDb();
  const resetDate = getResetDate();
  
  const stmt = database.prepare('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?');
  let usage = stmt.getAsObject([deviceId, resetDate]);
  stmt.free();
  
  if (!usage.device_id) {
    // Create new usage record
    const insertStmt = database.prepare('INSERT INTO usage (device_id, actions_used, reset_date) VALUES (?, 0, ?)');
    insertStmt.run([deviceId, resetDate]);
    insertStmt.free();
    
    saveDb();
    
    // Get the inserted record
    const selectStmt = database.prepare('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?');
    usage = selectStmt.getAsObject([deviceId, resetDate]);
    selectStmt.free();
  }
  
  return usage;
}

async function incrementUsage(deviceId) {
  const database = await initDb();
  const resetDate = getResetDate();
  
  // Ensure row exists
  await getUsage(deviceId);
  
  // Increment usage
  const updateStmt = database.prepare('UPDATE usage SET actions_used = actions_used + 1 WHERE device_id = ? AND reset_date = ?');
  updateStmt.run([deviceId, resetDate]);
  updateStmt.free();
  
  saveDb();
  
  return await getUsage(deviceId);
}

async function updatePlan(deviceId, plan) {
  const database = await initDb();
  
  const updateStmt = database.prepare('UPDATE devices SET plan = ? WHERE device_id = ?');
  updateStmt.run([plan, deviceId]);
  updateStmt.free();
  
  saveDb();
  
  const selectStmt = database.prepare('SELECT * FROM devices WHERE device_id = ?');
  const result = selectStmt.getAsObject([deviceId]);
  selectStmt.free();
  
  return result;
}

module.exports = {
  initDb,
  registerDevice,
  getDeviceByToken,
  getUsage,
  incrementUsage,
  updatePlan,
  getResetDate,
};
