// SQLite-based storage for OAuth state and sessions
import Database from 'better-sqlite3'

const db = new Database('./ffion-tracker.db')

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_sessions (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`)

// Clean up old state entries (older than 1 hour)
db.exec(`
  DELETE FROM oauth_state
  WHERE created_at < strftime('%s', 'now') - 3600
`)

export class StateStore {
  constructor() {
    this.getStmt = db.prepare('SELECT value FROM oauth_state WHERE key = ?')
    this.setStmt = db.prepare(
      'INSERT OR REPLACE INTO oauth_state (key, value) VALUES (?, ?)'
    )
    this.delStmt = db.prepare('DELETE FROM oauth_state WHERE key = ?')
  }

  async get(key) {
    const row = this.getStmt.get(key)
    if (!row) return undefined
    try {
      return JSON.parse(row.value)
    } catch (err) {
      console.error('Failed to parse state value:', err)
      return undefined
    }
  }

  async set(key, val) {
    this.setStmt.run(key, JSON.stringify(val))
  }

  async del(key) {
    this.delStmt.run(key)
  }
}

export class SessionStore {
  constructor() {
    this.getStmt = db.prepare('SELECT value FROM oauth_sessions WHERE key = ?')
    this.setStmt = db.prepare(`
      INSERT OR REPLACE INTO oauth_sessions (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
    `)
    this.delStmt = db.prepare('DELETE FROM oauth_sessions WHERE key = ?')
  }

  async get(key) {
    const row = this.getStmt.get(key)
    if (!row) return undefined
    try {
      return JSON.parse(row.value)
    } catch (err) {
      console.error('Failed to parse session value:', err)
      return undefined
    }
  }

  async set(key, val) {
    this.setStmt.run(key, JSON.stringify(val))
  }

  async del(key) {
    this.delStmt.run(key)
  }
}
