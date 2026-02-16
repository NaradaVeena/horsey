#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class HorseyDashboard {
  constructor(db, stats) {
    this.db = db;
    this.stats = stats;
  }

  async generateHTML() {
    const today = new Date().toISOString().split('T')[0];
    const todayStats = await this.stats.getTodaysSummary();
    const allTimeStats = await this.stats.getStats('all');
    const setupAnalysis = await this.stats.getSetupAnalysis();
    const streaks = await this.stats.getStreaks();
    
    const openTrades = await this.db.getTrades({ open: true });
    const todaysClosedTrades = (await this.db.getTrades({ date: 'today' })).filter(t => t.status === 'closed');
    const activeNarratives = await this.db.getNarratives({ active: true });
    const todaysWatchlist = await this.db.getWatchlist({ date: 'today' });
    const journal = await this.db.getJournal(today);
    const recentTrades = (await this.db.getTrades({})).slice(0, 20); // Last 20 trades
    const paperTrades = await this.db.getTrades({ paper: true });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Horsey 🐴 - Trading Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            font-size: 13px;
            line-height: 1.4;
        }
        
        .mono {
            font-family: 'Fira Code', monospace;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 12px;
        }
        
        .header {
            background: linear-gradient(135deg, #1a1a1a, #2d2d2d);
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 12px 20px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        .header-left h1 {
            color: #00d4aa;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .header-stats {
            display: flex;
            gap: 24px;
            align-items: center;
            flex-wrap: wrap;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-value {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 2px;
        }
        
        .stat-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .positive { color: #00ff88; }
        .negative { color: #ff4444; }
        .neutral { color: #ffaa00; }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 12px;
            margin-bottom: 12px;
        }
        
        .card {
            background: #1a1a1a;
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 16px;
        }
        
        .card-header {
            border-bottom: 1px solid #404040;
            padding-bottom: 8px;
            margin-bottom: 12px;
            font-weight: 600;
            font-size: 14px;
            color: #00d4aa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .trade-row, .narrative-row, .watch-row {
            padding: 8px 0;
            border-bottom: 1px solid #2a2a2a;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .trade-row:last-child, .narrative-row:last-child, .watch-row:last-child {
            border-bottom: none;
        }
        
        .ticker {
            font-weight: 600;
            font-size: 14px;
            color: #00d4aa;
        }
        
        .price {
            font-weight: 500;
        }
        
        .pnl {
            font-weight: 600;
            text-align: right;
        }
        
        .setup-type {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
        }
        
        .levels {
            font-size: 11px;
            color: #888;
            font-family: 'Fira Code', monospace;
        }
        
        .status-badge {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .status-active { background: #00ff88; color: #000; }
        .status-watching { background: #ffaa00; color: #000; }
        .status-triggered { background: #ff4444; color: #fff; }
        .status-open { background: #00d4aa; color: #000; }
        .status-closed { background: #666; color: #fff; }
        
        .perf-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
        }
        
        .perf-card {
            background: #2a2a2a;
            border-radius: 4px;
            padding: 12px;
            text-align: center;
        }
        
        .perf-value {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .perf-label {
            font-size: 10px;
            color: #888;
            text-transform: uppercase;
        }
        
        .table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        
        .table th {
            background: #2a2a2a;
            padding: 8px 6px;
            text-align: left;
            font-weight: 500;
            color: #888;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
        }
        
        .table td {
            padding: 6px;
            border-bottom: 1px solid #2a2a2a;
        }
        
        .table tr:hover {
            background: #252525;
        }
        
        .nav {
            margin-top: 20px;
            padding: 16px;
            border-top: 1px solid #404040;
            text-align: center;
        }
        
        .nav a {
            color: #00d4aa;
            text-decoration: none;
            margin: 0 20px;
            font-weight: 500;
        }
        
        .nav a:hover {
            text-decoration: underline;
        }
        
        .journal-text {
            background: #2a2a2a;
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        
        .empty-state {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 20px;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .header-stats {
                justify-content: center;
            }
            
            .container {
                padding: 8px;
            }
            
            .nav a {
                display: block;
                margin: 8px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        ${this.generateHeader(todayStats, allTimeStats, streaks)}
        
        <div class="grid">
            ${this.generateTodaysAction(openTrades, todaysClosedTrades)}
            ${this.generateActiveNarratives(activeNarratives)}
            ${this.generateWatchlist(todaysWatchlist)}
            ${this.generatePerformance(allTimeStats)}
        </div>
        
        <div class="grid">
            ${this.generateTradeLog(recentTrades)}
            ${this.generateJournal(journal)}
            ${this.generateSetupAnalysis(setupAnalysis)}
        </div>

        ${this.generatePaperTrades(paperTrades)}
        
        ${this.generateNav()}
    </div>
    
    <script>
        // Auto-refresh every 5 minutes
        setTimeout(() => {
            window.location.reload();
        }, 300000);
        
        // Add timestamp
        document.addEventListener('DOMContentLoaded', function() {
            const now = new Date();
            const timestamp = now.toLocaleString();
            document.title = 'Horsey 🐴 - ' + timestamp;
        });
    </script>
</body>
</html>`;

    return html;
  }

  generateHeader(todayStats, allTimeStats, streaks) {
    const todayPnL = todayStats.totalPnL || 0;
    const pnlClass = todayPnL > 0 ? 'positive' : todayPnL < 0 ? 'negative' : 'neutral';
    const winRate = allTimeStats.winRate || 0;
    
    return `
    <div class="header">
        <div class="header-left">
            <h1>Horsey 🐴</h1>
            <div class="stat-label">Day Trading Dashboard</div>
        </div>
        <div class="header-stats">
            <div class="stat-item">
                <div class="stat-value ${pnlClass} mono">$${todayPnL.toFixed(2)}</div>
                <div class="stat-label">Today P&L</div>
            </div>
            <div class="stat-item">
                <div class="stat-value mono">${winRate.toFixed(1)}%</div>
                <div class="stat-label">Win Rate</div>
            </div>
            <div class="stat-item">
                <div class="stat-value mono">${todayStats.openPositions || 0}</div>
                <div class="stat-label">Open Positions</div>
            </div>
            <div class="stat-item">
                <div class="stat-value mono">${streaks.currentStreak.count}</div>
                <div class="stat-label">${streaks.currentStreak.type} streak</div>
            </div>
        </div>
    </div>`;
  }

  generateTodaysAction(openTrades, closedTrades) {
    const openRows = openTrades.map(trade => `
      <div class="trade-row">
        <div>
          <div class="ticker">${trade.ticker}</div>
          <div class="setup-type">${trade.direction} ${trade.size}x ${trade.instrument} • ${trade.setup_type}</div>
        </div>
        <div style="text-align: right;">
          <div class="price mono">$${trade.entry_price.toFixed(2)}</div>
          <span class="status-badge status-open">OPEN</span>
        </div>
      </div>
    `).join('');

    const closedRows = closedTrades.map(trade => {
      const pnlClass = trade.pnl > 0 ? 'positive' : trade.pnl < 0 ? 'negative' : 'neutral';
      return `
        <div class="trade-row">
          <div>
            <div class="ticker">${trade.ticker}</div>
            <div class="setup-type">${trade.direction} ${trade.size}x ${trade.instrument} • ${trade.setup_type}</div>
          </div>
          <div style="text-align: right;">
            <div class="pnl ${pnlClass} mono">$${trade.pnl.toFixed(2)}</div>
            <span class="status-badge status-closed">CLOSED</span>
          </div>
        </div>
      `;
    }).join('');

    return `
    <div class="card">
        <div class="card-header">📈 Today's Action</div>
        ${openRows || '<div class="empty-state">No open positions</div>'}
        ${closedRows || '<div class="empty-state">No closed trades today</div>'}
    </div>`;
  }

  generateActiveNarratives(narratives) {
    const rows = narratives.map(narrative => {
      const levels = narrative.key_levels ? narrative.key_levels.join(', ') : '';
      const directionIcon = narrative.direction === 'bull' ? '🟢' : narrative.direction === 'bear' ? '🔴' : '⚪';
      
      return `
        <div class="narrative-row">
          <div>
            <div class="ticker">${narrative.ticker} ${directionIcon}</div>
            <div style="font-size: 12px; margin: 4px 0;">${narrative.narrative}</div>
            ${levels ? `<div class="levels">Levels: ${levels}</div>` : ''}
            ${narrative.invalidation ? `<div class="levels">Invalid: ${narrative.invalidation}</div>` : ''}
          </div>
          <div>
            <span class="status-badge status-active">ACTIVE</span>
          </div>
        </div>
      `;
    }).join('');

    return `
    <div class="card">
        <div class="card-header">📊 Active Narratives</div>
        ${rows || '<div class="empty-state">No active narratives</div>'}
    </div>`;
  }

  generateWatchlist(watchlist) {
    const rows = watchlist.map(item => {
      const levels = item.key_levels ? Object.values(item.key_levels).filter(v => v).join(', ') : '';
      const biasIcon = item.bias === 'long' ? '🟢' : item.bias === 'short' ? '🔴' : '⚪';
      const priorityStars = '⭐'.repeat(item.priority);
      
      return `
        <div class="watch-row">
          <div>
            <div class="ticker">${item.ticker} ${biasIcon} ${priorityStars}</div>
            <div style="font-size: 12px; margin: 4px 0;">${item.setup}</div>
            ${levels ? `<div class="levels">Levels: ${levels}</div>` : ''}
            ${item.options_flow_note ? `<div class="levels">Flow: ${item.options_flow_note}</div>` : ''}
          </div>
          <div>
            <span class="status-badge status-watching">WATCHING</span>
          </div>
        </div>
      `;
    }).join('');

    return `
    <div class="card">
        <div class="card-header">👀 Today's Watchlist</div>
        ${rows || '<div class="empty-state">No watchlist items</div>'}
    </div>`;
  }

  generatePerformance(stats) {
    return `
    <div class="card">
        <div class="card-header">🎯 Performance</div>
        <div class="perf-grid">
            <div class="perf-card">
                <div class="perf-value mono">${stats.totalTrades}</div>
                <div class="perf-label">Total Trades</div>
            </div>
            <div class="perf-card">
                <div class="perf-value mono ${stats.winRate >= 50 ? 'positive' : 'negative'}">${stats.winRate.toFixed(1)}%</div>
                <div class="perf-label">Win Rate</div>
            </div>
            <div class="perf-card">
                <div class="perf-value mono ${stats.profitFactor >= 1 ? 'positive' : 'negative'}">${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}</div>
                <div class="perf-label">Profit Factor</div>
            </div>
            <div class="perf-card">
                <div class="perf-value mono ${stats.totalPnL >= 0 ? 'positive' : 'negative'}">$${stats.totalPnL.toFixed(2)}</div>
                <div class="perf-label">Total P&L</div>
            </div>
            <div class="perf-card">
                <div class="perf-value mono positive">$${stats.avgWinner.toFixed(2)}</div>
                <div class="perf-label">Avg Winner</div>
            </div>
            <div class="perf-card">
                <div class="perf-value mono negative">$${stats.avgLoser.toFixed(2)}</div>
                <div class="perf-label">Avg Loser</div>
            </div>
        </div>
    </div>`;
  }

  generateTradeLog(trades) {
    const rows = trades.map(trade => {
      const pnlClass = !trade.pnl ? 'neutral' : trade.pnl > 0 ? 'positive' : 'negative';
      const pnl = trade.pnl ? `$${trade.pnl.toFixed(2)}` : 'OPEN';
      const entryDate = new Date(trade.entry_time).toLocaleDateString();
      
      return `
        <tr>
          <td><span class="ticker">${trade.ticker}</span></td>
          <td>${trade.direction}</td>
          <td>${trade.instrument}</td>
          <td class="mono">${trade.size}</td>
          <td class="mono">$${trade.entry_price.toFixed(2)}</td>
          <td class="mono">${trade.exit_price ? '$' + trade.exit_price.toFixed(2) : '-'}</td>
          <td class="mono ${pnlClass}">${pnl}</td>
          <td class="setup-type">${trade.setup_type}</td>
          <td>${entryDate}</td>
        </tr>
      `;
    }).join('');

    return `
    <div class="card" style="grid-column: 1 / -1;">
        <div class="card-header">📋 Recent Trades</div>
        <div style="overflow-x: auto;">
            <table class="table">
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Direction</th>
                        <th>Instrument</th>
                        <th>Qty</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>P&L</th>
                        <th>Setup</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="8" class="empty-state">No trades yet</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>`;
  }

  generateJournal(journal) {
    return `
    <div class="card">
        <div class="card-header">📝 Journal</div>
        <div>
            <strong>Pre-market Plan:</strong>
            <div class="journal-text">${journal?.premarket_plan || 'No plan set for today'}</div>
        </div>
        <div style="margin-top: 16px;">
            <strong>Post-market Review:</strong>
            <div class="journal-text">${journal?.postmarket_review || 'No review yet'}</div>
        </div>
        ${journal?.grade ? `<div style="margin-top: 8px;"><strong>Grade:</strong> <span class="mono">${journal.grade}</span></div>` : ''}
        ${journal?.market_context ? `<div style="margin-top: 8px;"><strong>Market Context:</strong> ${journal.market_context}</div>` : ''}
    </div>`;
  }

  generateSetupAnalysis(setupStats) {
    const rows = Object.entries(setupStats)
      .sort(([,a], [,b]) => b.totalPnL - a.totalPnL)
      .map(([setup, stats]) => {
        const winRateClass = stats.winRate >= 50 ? 'positive' : 'negative';
        const pnlClass = stats.totalPnL >= 0 ? 'positive' : 'negative';
        
        return `
          <tr>
            <td><span class="setup-type">${setup.toUpperCase()}</span></td>
            <td class="mono">${stats.totalTrades}</td>
            <td class="mono ${winRateClass}">${stats.winRate.toFixed(1)}%</td>
            <td class="mono ${pnlClass}">$${stats.totalPnL.toFixed(2)}</td>
            <td class="mono">$${stats.avgPnL.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

    return `
    <div class="card">
        <div class="card-header">⚙️ Setup Analysis</div>
        <div style="overflow-x: auto;">
            <table class="table">
                <thead>
                    <tr>
                        <th>Setup</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Total P&L</th>
                        <th>Avg P&L</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="5" class="empty-state">No completed trades</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>`;
  }

  generatePaperTrades(trades) {
    if (!trades || trades.length === 0) return '';
    
    const closed = trades.filter(t => t.status === 'closed');
    const open = trades.filter(t => t.status === 'open');

    // Outcome sizing: small = <30% move, big = >30% move
    function getOutcome(trade) {
      if (!trade.pnl) return { label: 'OPEN', color: '#888', icon: '⏳' };
      const pctMove = Math.abs((trade.exit_price - trade.entry_price) / trade.entry_price) * 100;
      const isWin = trade.pnl > 0;
      if (isWin && pctMove >= 30) return { label: '', color: '#00ff88', icon: '🟢🟢' };
      if (isWin) return { label: '', color: '#00cc66', icon: '🟢' };
      if (!isWin && pctMove >= 30) return { label: '', color: '#ff4444', icon: '🔴🔴' };
      return { label: '', color: '#cc6644', icon: '🔴' };
    }

    // Execution grade: good = had thesis + waited for confirmation, bad = chased or no plan
    function getExecGrade(trade) {
      const lessons = (trade.lessons || '').toLowerCase();
      const notes = (trade.notes || '').toLowerCase();
      if (lessons.includes('didn\'t') || lessons.includes('chased') || lessons.includes('late') || lessons.includes('didn\'t pull')) 
        return { label: 'POOR', color: '#ff4444' };
      if (lessons.includes('right read') || lessons.includes('clean') || lessons.includes('patience'))
        return { label: 'GOOD', color: '#00ff88' };
      return { label: '—', color: '#888' };
    }

    const cards = trades.map(trade => {
      const outcome = getOutcome(trade);
      const exec = getExecGrade(trade);
      const entryDate = new Date(trade.entry_time).toLocaleDateString();
      const notes = trade.notes || '';
      const lessons = trade.lessons || '';
      const borderColor = outcome.label === 'OPEN' ? '#444' : outcome.color;

      return `
        <div style="background: #1a1f2e; border: 1px solid #2a3040; border-radius: 8px; padding: 14px; margin-bottom: 10px; border-left: 3px solid ${borderColor};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <span class="ticker" style="font-size: 1.1em;">${trade.ticker}</span>
              <span style="color: #888; margin-left: 8px;">${trade.direction.toUpperCase()} ${trade.size}x ${trade.instrument}</span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 1.1em;">${outcome.icon}</span>
            </div>
          </div>
          <div style="display: flex; gap: 20px; font-size: 0.85em; color: #aaa; margin-bottom: 6px;">
            <span>Entry: <span class="mono">$${trade.entry_price.toFixed(2)}</span></span>
            <span>Exit: <span class="mono">${trade.exit_price ? '$' + trade.exit_price.toFixed(2) : '—'}</span></span>
            <span>Setup: ${trade.setup_type}</span>
            <span>${entryDate}</span>
          </div>
          ${notes ? `<div style="font-size: 0.85em; color: #ccc; margin-top: 6px; padding: 6px 8px; background: #141820; border-radius: 4px;">${notes}</div>` : ''}
          ${lessons ? `<div style="font-size: 0.85em; color: #ffaa00; margin-top: 4px; padding: 6px 8px; background: #1a1810; border-radius: 4px;">💡 ${lessons}</div>` : ''}
        </div>`;
    }).join('');

    // Summary: count by outcome type
    const outcomes = closed.map(getOutcome);
    const bigGreen = outcomes.filter(o => o.label === 'BIG GREEN').length;
    const smallGreen = outcomes.filter(o => o.label === 'SMALL GREEN').length;
    const smallRed = outcomes.filter(o => o.label === 'SMALL RED').length;
    const bigRed = outcomes.filter(o => o.label === 'BIG RED').length;

    return `
    <div class="card" style="grid-column: 1 / -1;">
        <div class="card-header">📝 PAPER TRADES — Execution Muscle</div>
        <div style="display: flex; gap: 16px; margin-bottom: 14px; font-size: 0.85em; flex-wrap: wrap;">
          <div style="background: #1a1f2e; padding: 6px 12px; border-radius: 6px;">
            <span style="color: #888;">Total:</span> <span class="mono">${trades.length}</span>
            ${open.length > 0 ? `<span style="color: #888; margin-left: 6px;">Open:</span> <span class="mono">${open.length}</span>` : ''}
          </div>
          ${bigGreen > 0 ? `<div style="background: #1a1f2e; padding: 6px 12px; border-radius: 6px;">🟢🟢 <span class="mono">${bigGreen}</span></div>` : ''}
          ${smallGreen > 0 ? `<div style="background: #1a1f2e; padding: 6px 12px; border-radius: 6px;">🟢 <span class="mono">${smallGreen}</span></div>` : ''}
          ${smallRed > 0 ? `<div style="background: #1a1f2e; padding: 6px 12px; border-radius: 6px;">🔴 <span class="mono">${smallRed}</span></div>` : ''}
          ${bigRed > 0 ? `<div style="background: #1a1f2e; padding: 6px 12px; border-radius: 6px;">🔴🔴 <span class="mono">${bigRed}</span></div>` : ''}
        </div>
        ${cards}
    </div>`;
  }

  generateNav() {
    return `
    <div class="nav">
        <a href="/horsey/">Horsey 🐴</a>
        <a href="/aiportfolio/">Tiger Portfolio 🐅</a>
        <a href="/">Research Portal 📊</a>
    </div>`;
  }

  async save() {
    const html = await this.generateHTML();
    const dashboardPath = path.join(__dirname, 'dashboard', 'index.html');
    
    // Ensure dashboard directory exists
    const dashboardDir = path.dirname(dashboardPath);
    if (!fs.existsSync(dashboardDir)) {
      fs.mkdirSync(dashboardDir, { recursive: true });
    }
    
    fs.writeFileSync(dashboardPath, html, 'utf8');
    return dashboardPath;
  }
}

module.exports = HorseyDashboard;