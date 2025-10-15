// In-memory storage for OAuth state and sessions
// In a production environment, you would use a database for persistent storage

export class StateStore {
  constructor() {
    this.store = new Map()
  }

  async get(key) {
    return this.store.get(key)
  }

  async set(key, val) {
    this.store.set(key, val)
  }

  async del(key) {
    this.store.delete(key)
  }
}

export class SessionStore {
  constructor() {
    this.store = new Map()
  }

  async get(key) {
    return this.store.get(key)
  }

  async set(key, val) {
    this.store.set(key, val)
  }

  async del(key) {
    this.store.delete(key)
  }
}
