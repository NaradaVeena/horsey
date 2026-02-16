#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class HorseyDB {
  constructor(dbPath = null) {
    if (!dbPath) {
      dbPath = path.join(__dirname, 'data', 'horsey.db');
    }
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath);
    
    // Enable foreign keys and set WAL mode
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run('PRAGMA journal_mode = WAL');
    
    // Initialize tables synchronously
    this.initTablesSync();
  }

  initTablesSync() {
    const tables = [
      // Create narratives table
      `CREATE TABLE IF NOT EXISTS narratives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        narrative TEXT NOT NULL,
        direction TEXT CHECK(direction IN ('bull', 'bear', 'neutral')) DEFAULT 'neutral',
        timeframe TEXT CHECK(timeframe IN ('intraday', 'swing', 'multi-day')) DEFAULT 'intraday',
        key_levels TEXT,
        invalidation REAL,
        status TEXT CHECK(status IN ('active', 'triggered', 'invalidated', 'expired')) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      )`,

      // Create watchlist table
      `CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        ticker TEXT NOT NULL,
        setup TEXT NOT NULL,
        key_levels TEXT,
        bias TEXT CHECK(bias IN ('long', 'short', 'neutral')) DEFAULT 'neutral',
        priority INTEGER CHECK(priority BETWEEN 1 AND 5) DEFAULT 3,
        options_flow_note TEXT,
        status TEXT CHECK(status IN ('watching', 'triggered', 'skipped', 'missed')) DEFAULT 'watching',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create trades table
      `CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        direction TEXT CHECK(direction IN ('long', 'short')) NOT NULL,
        instrument TEXT CHECK(instrument IN ('shares', 'calls', 'puts', '0dte-calls', '0dte-puts', 'csp')) NOT NULL,
        entry_price REAL NOT NULL,
        entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        exit_price REAL,
        exit_time DATETIME,
        size INTEGER NOT NULL,
        cost_basis REAL NOT NULL,
        proceeds REAL,
        pnl REAL,
        pnl_pct REAL,
        setup_type TEXT CHECK(setup_type IN ('breakout', 'fade', 'momentum', 'reversal', 'csp', 'squeeze', 'other')) DEFAULT 'other',
        narrative_id INTEGER,
        watchlist_id INTEGER,
        planned_risk REAL,
        planned_target REAL,
        actual_rr REAL,
        notes TEXT,
        lessons TEXT,
        status TEXT CHECK(status IN ('open', 'closed', 'partial')) DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (narrative_id) REFERENCES narratives(id),
        FOREIGN KEY (watchlist_id) REFERENCES watchlist(id)
      )`,

      // Create journal table
      `CREATE TABLE IF NOT EXISTS journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE UNIQUE NOT NULL,
        premarket_plan TEXT,
        postmarket_review TEXT,
        market_context TEXT,
        grade TEXT CHECK(grade IN ('A', 'B', 'C', 'D', 'F')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create playbook table
      `CREATE TABLE IF NOT EXISTS playbook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        entry_rules TEXT,
        exit_rules TEXT,
        risk_rules TEXT,
        example_tickers TEXT,
        win_rate REAL DEFAULT 0,
        status TEXT CHECK(status IN ('active', 'retired')) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_narratives_status ON narratives(status)',
      'CREATE INDEX IF NOT EXISTS idx_narratives_ticker ON narratives(ticker)',
      'CREATE INDEX IF NOT EXISTS idx_watchlist_date ON watchlist(date)',
      'CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)',
      'CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)',
      'CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker)',
      'CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time)'
    ];

    // Create tables synchronously
    tables.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) console.error('Table creation error:', err);
      });
    });

    // Create indices synchronously
    indices.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) console.error('Index creation error:', err);
      });
    });
  }

  // Helper to promisify database operations
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Wait for database to be ready
  async ready() {
    return new Promise((resolve) => {
      setTimeout(resolve, 100); // Give DB time to initialize
    });
  }

  // Narrative operations
  async addNarrative(ticker, narrative, options = {}) {
    await this.ready();
    const sql = `
      INSERT INTO narratives (ticker, narrative, direction, timeframe, key_levels, invalidation)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [
      ticker.toUpperCase(),
      narrative,
      options.direction || 'neutral',
      options.timeframe || 'intraday',
      options.levels ? JSON.stringify(options.levels) : null,
      options.invalidation || null
    ]);
    
    return result.lastID;
  }

  async getNarratives(filters = {}) {
    let query = 'SELECT * FROM narratives WHERE 1=1';
    const params = [];

    if (filters.active) {
      query += ' AND status = ?';
      params.push('active');
    }
    if (filters.ticker) {
      query += ' AND ticker = ?';
      params.push(filters.ticker.toUpperCase());
    }

    query += ' ORDER BY created_at DESC';
    
    const narratives = await this.all(query, params);
    
    return narratives.map(n => ({
      ...n,
      key_levels: n.key_levels ? JSON.parse(n.key_levels) : null
    }));
  }

  async updateNarrativeStatus(id, status, outcome = null) {
    const sql = `
      UPDATE narratives 
      SET status = ?, updated_at = CURRENT_TIMESTAMP, resolved_at = ?
      WHERE id = ?
    `;
    
    const resolvedAt = ['triggered', 'invalidated', 'expired'].includes(status) ? new Date().toISOString() : null;
    return await this.run(sql, [status, resolvedAt, id]);
  }

  // Watchlist operations
  async addToWatchlist(ticker, setup, options = {}) {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      INSERT INTO watchlist (date, ticker, setup, key_levels, bias, priority, options_flow_note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [
      today,
      ticker.toUpperCase(),
      setup,
      options.levels ? JSON.stringify(options.levels) : null,
      options.bias || 'neutral',
      options.priority || 3,
      options.flow || null
    ]);
    
    return result.lastID;
  }

  async getWatchlist(filters = {}) {
    let query = 'SELECT * FROM watchlist WHERE 1=1';
    const params = [];

    if (filters.date === 'today') {
      const today = new Date().toISOString().split('T')[0];
      query += ' AND date = ?';
      params.push(today);
    } else if (filters.date) {
      query += ' AND date = ?';
      params.push(filters.date);
    }

    if (filters.active) {
      query += ' AND status = ?';
      params.push('watching');
    }

    query += ' ORDER BY priority DESC, created_at DESC';
    
    const watchlist = await this.all(query, params);
    
    return watchlist.map(w => ({
      ...w,
      key_levels: w.key_levels ? JSON.parse(w.key_levels) : null
    }));
  }

  async updateWatchlistStatus(id, status) {
    const sql = 'UPDATE watchlist SET status = ? WHERE id = ?';
    return await this.run(sql, [status, id]);
  }

  async clearWatchlist() {
    const sql = 'DELETE FROM watchlist WHERE date < date("now")';
    return await this.run(sql);
  }

  // Trade operations
  async openTrade(ticker, direction, instrument, entryPrice, size, options = {}) {
    // Options contracts = 100 shares per contract
    const multiplier = ['shares'].includes(instrument) ? 1 : 100;
    const COMMISSION = 1.00; // $1 fixed round-trip fee, subtracted at entry
    const costBasis = (entryPrice * size * multiplier) + COMMISSION;
    
    const sql = `
      INSERT INTO trades (
        ticker, direction, instrument, entry_price, size, cost_basis,
        setup_type, narrative_id, watchlist_id, planned_risk, planned_target, notes, is_paper
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [
      ticker.toUpperCase(),
      direction,
      instrument,
      entryPrice,
      size,
      costBasis,
      options.setup || 'other',
      options.narrative || null,
      options.watchlist || null,
      options.risk || null,
      options.target || null,
      options.notes || null,
      options.paper ? 1 : 0
    ]);
    
    return result.lastID;
  }

  async closeTrade(id, exitPrice, options = {}) {
    const trade = await this.get('SELECT * FROM trades WHERE id = ?', [id]);
    if (!trade) {
      throw new Error(`Trade ${id} not found`);
    }

    // Options contracts = 100 shares per contract
    // Commission already included in cost_basis at entry
    const multiplier = ['shares'].includes(trade.instrument) ? 1 : 100;
    const proceeds = exitPrice * trade.size * multiplier;
    const pnl = proceeds - trade.cost_basis;
    const pnlPct = (pnl / trade.cost_basis) * 100;
    
    // Calculate actual R:R if planned risk was set
    let actualRR = null;
    if (trade.planned_risk) {
      actualRR = pnl / trade.planned_risk;
    }

    const sql = `
      UPDATE trades 
      SET exit_price = ?, exit_time = CURRENT_TIMESTAMP, proceeds = ?, pnl = ?, pnl_pct = ?, 
          actual_rr = ?, status = 'closed', notes = ?, lessons = ?
      WHERE id = ?
    `;
    
    return await this.run(sql, [
      exitPrice, proceeds, pnl, pnlPct, actualRR,
      options.notes || trade.notes,
      options.lessons || null,
      id
    ]);
  }

  async getTrades(filters = {}) {
    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = [];

    // Filter paper vs real trades
    if (filters.paper) {
      query += ' AND is_paper = 1';
    } else if (!filters.includePaper) {
      query += ' AND (is_paper = 0 OR is_paper IS NULL)';
    }

    if (filters.open) {
      query += ' AND status = ?';
      params.push('open');
    }
    if (filters.ticker) {
      query += ' AND ticker = ?';
      params.push(filters.ticker.toUpperCase());
    }
    if (filters.date === 'today') {
      query += ' AND date(entry_time) = date("now")';
    } else if (filters.date) {
      query += ' AND date(entry_time) = ?';
      params.push(filters.date);
    }

    query += ' ORDER BY entry_time DESC';
    
    return await this.all(query, params);
  }

  async updateTradeNotes(id, notes, lessons = null) {
    const sql = 'UPDATE trades SET notes = ?, lessons = ? WHERE id = ?';
    return await this.run(sql, [notes, lessons, id]);
  }

  // Journal operations
  async setPlan(plan) {
    const today = new Date().toISOString().split('T')[0];
    
    // Try to update first, then insert if no rows affected
    let result = await this.run('UPDATE journal SET premarket_plan = ?, updated_at = CURRENT_TIMESTAMP WHERE date = ?', [plan, today]);
    
    if (result.changes === 0) {
      result = await this.run('INSERT INTO journal (date, premarket_plan) VALUES (?, ?)', [today, plan]);
    }
    
    return result;
  }

  async setReview(review, options = {}) {
    const today = new Date().toISOString().split('T')[0];
    
    // Try to update first, then insert if no rows affected
    let result = await this.run(`
      UPDATE journal 
      SET postmarket_review = ?, market_context = ?, grade = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE date = ?
    `, [review, options.context || null, options.grade || null, today]);
    
    if (result.changes === 0) {
      result = await this.run(`
        INSERT INTO journal (date, postmarket_review, market_context, grade) 
        VALUES (?, ?, ?, ?)
      `, [today, review, options.context || null, options.grade || null]);
    }
    
    return result;
  }

  async getJournal(date = null) {
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }
    
    return await this.get('SELECT * FROM journal WHERE date = ?', [date]);
  }

  // Playbook operations
  async addPlaybook(name, options = {}) {
    const sql = `
      INSERT INTO playbook (name, description, entry_rules, exit_rules, risk_rules, example_tickers)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [
      name,
      options.desc || null,
      options.entry || null,
      options.exit || null,
      options.risk || null,
      options.examples || null
    ]);
    
    return result.lastID;
  }

  async getPlaybook() {
    const sql = 'SELECT * FROM playbook WHERE status = "active" ORDER BY name';
    return await this.all(sql);
  }

  close() {
    this.db.close();
  }
}

module.exports = HorseyDB;