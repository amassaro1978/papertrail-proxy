const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const DB_PATH = path.join(__dirname, 'papertrail.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
    // Promisify the methods we need
    db.getAsync = promisify(db.get.bind(db));
    db.runAsync = promisify(db.run.bind(db));
    db.allAsync = promisify(db.all.bind(db));
    db.execAsync = promisify(db.exec.bind(db));
    
    initTables();
  }
  return db;
}

async function initTables() {
  const db = getDb();
  await db.execAsync(`
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

async function registerDevice(deviceId, token) {
  const db = getDb();
  const existing = await db.getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
  
  if (existing) {
    return existing;
  }

  await db.runAsync('INSERT INTO devices (device_id, token, plan) VALUES (?, ?, ?)', [deviceId, token, 'free']);
  return await db.getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
}

async function getDeviceByToken(token) {
  const db = getDb();
  return await db.getAsync('SELECT * FROM devices WHERE token = ?', [token]);
}

async function getUsage(deviceId) {
  const db = getDb();
  const resetDate = getResetDate();
  
  let usage = await db.getAsync('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?', [deviceId, resetDate]);
  
  if (!usage) {
    await db.runAsync('INSERT INTO usage (device_id, actions_used, reset_date) VALUES (?, 0, ?)', [deviceId, resetDate]);
    usage = await db.getAsync('SELECT * FROM usage WHERE device_id = ? AND reset_date = ?', [deviceId, resetDate]);
  }
  
  return usage;
}

async function incrementUsage(deviceId) {
  const db = getDb();
  const resetDate = getResetDate();
  
  // Ensure row exists
  await getUsage(deviceId);
  
  await db.runAsync('UPDATE usage SET actions_used = actions_used + 1 WHERE device_id = ? AND reset_date = ?', [deviceId, resetDate]);
  return await getUsage(deviceId);
}

async function updatePlan(deviceId, plan) {
  const db = getDb();
  await db.runAsync('UPDATE devices SET plan = ? WHERE device_id = ?', [plan, deviceId]);
  return await db.getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
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
