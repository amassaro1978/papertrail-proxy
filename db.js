const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'papertrail.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
  }
  return db;
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
}

// Get the reset date (first of current month)
function getResetDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function registerDevice(deviceId, token) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
  
  if (existing) {
    return existing;
  }

  db.prepare('INSERT INTO devices (device_id, token, plan) VALUES (?, ?, ?)').run(deviceId, token, 'free');
  return db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
}

function getDeviceByToken(token) {
  const db = getDb();
  return db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
}

function getUsage(deviceId) {
  const db = getDb();
  const resetDate = getResetDate();
  
  let usage = db.prepare('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?').get(deviceId, resetDate);
  
  if (!usage) {
    db.prepare('INSERT INTO usage (device_id, actions_used, reset_date) VALUES (?, 0, ?)').run(deviceId, resetDate);
    usage = db.prepare('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?').get(deviceId, resetDate);
  }
  
  return usage;
}

function incrementUsage(deviceId) {
  const db = getDb();
  const resetDate = getResetDate();
  
  // Ensure row exists
  getUsage(deviceId);
  
  db.prepare('UPDATE usage SET actions_used = actions_used + 1 WHERE device_id = ? AND reset_date = ?').run(deviceId, resetDate);
  return getUsage(deviceId);
}

function updatePlan(deviceId, plan) {
  const db = getDb();
  db.prepare('UPDATE devices SET plan = ? WHERE device_id = ?').run(plan, deviceId);
  return db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId);
}

module.exports = {
  getDb,
  registerDevice,
  getDeviceByToken,
  getUsage,
  incrementUsage,
  updatePlan,
  getResetDate,
};
