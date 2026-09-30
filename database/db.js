const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(config.dbPath));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// TABLE CREATION
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    user_token TEXT NOT NULL,
    username TEXT DEFAULT '',
    linked_at INTEGER DEFAULT (unixepoch()),
    autoquest_enabled INTEGER DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    restricted_channel_id TEXT,
    added_at INTEGER DEFAULT (unixepoch())
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blacklist (
    user_id TEXT PRIMARY KEY,
    reason TEXT DEFAULT '',
    added_at INTEGER DEFAULT (unixepoch())
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS server_whitelist (
    guild_id TEXT PRIMARY KEY,
    added_at INTEGER DEFAULT (unixepoch())
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    quest_name TEXT DEFAULT '',
    status TEXT DEFAULT 'completed',
    completed_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(user_id, quest_id)
  );
`);

// Migration: if old columns exist, migrate data
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const colNames = cols.map(c => c.name);
  if (colNames.includes('access_token') && !colNames.includes('user_token')) {
    db.exec('ALTER TABLE users ADD COLUMN user_token TEXT DEFAULT ""');
    db.exec('UPDATE users SET user_token = access_token WHERE access_token IS NOT NULL');
    console.log('[DB] Migrated access_token -> user_token');
  }
  if (!colNames.includes('username')) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT DEFAULT ""');
  }
} catch (e) {
  // Ignore migration errors on fresh DB
}

// ============================================================
// PREPARED STATEMENTS
// ============================================================

const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (user_id, user_token, username)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      user_token = excluded.user_token,
      username = excluded.username
  `),
  getUser: db.prepare('SELECT * FROM users WHERE user_id = ?'),
  removeUser: db.prepare('DELETE FROM users WHERE user_id = ?'),
  setAutoquest: db.prepare('UPDATE users SET autoquest_enabled = ? WHERE user_id = ?'),
  getAutoquestUsers: db.prepare('SELECT * FROM users WHERE autoquest_enabled = 1'),
  getAllLinkedUsers: db.prepare('SELECT user_id, username, linked_at, autoquest_enabled FROM users'),

  setGuildChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, restricted_channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET restricted_channel_id = excluded.restricted_channel_id
  `),
  getGuildSetting: db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?'),
  removeGuildSetting: db.prepare('DELETE FROM guild_settings WHERE guild_id = ?'),

  addToBlacklist: db.prepare('INSERT OR IGNORE INTO blacklist (user_id, reason) VALUES (?, ?)'),
  removeFromBlacklist: db.prepare('DELETE FROM blacklist WHERE user_id = ?'),
  isBlacklisted: db.prepare('SELECT 1 FROM blacklist WHERE user_id = ?'),
  getBlacklist: db.prepare('SELECT * FROM blacklist ORDER BY added_at DESC'),

  addToWhitelist: db.prepare('INSERT OR IGNORE INTO server_whitelist (guild_id) VALUES (?)'),
  removeFromWhitelist: db.prepare('DELETE FROM server_whitelist WHERE guild_id = ?'),
  isWhitelisted: db.prepare('SELECT 1 FROM server_whitelist WHERE guild_id = ?'),
  getWhitelist: db.prepare('SELECT * FROM server_whitelist ORDER BY added_at DESC'),

  logQuest: db.prepare(`
    INSERT OR IGNORE INTO quest_log (user_id, quest_id, quest_name, status)
    VALUES (?, ?, ?, ?)
  `),
  getQuestLog: db.prepare('SELECT * FROM quest_log WHERE user_id = ? ORDER BY completed_at DESC'),
  getQuestStats: db.prepare(`
    SELECT user_id, COUNT(*) as total_completed
    FROM quest_log
    WHERE status = 'completed'
    GROUP BY user_id
    ORDER BY total_completed DESC
  `),
};

module.exports = { db, stmts };
