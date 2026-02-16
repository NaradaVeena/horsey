#!/usr/bin/env node

class HorseyStats {
  constructor(db) {
    this.db = db;
  }

  // Main stats for a given period
  async getStats(period = 'all', ticker = null) {
    let dateFilter = '';
    const params = [];

    switch (period) {
      case 'today':
        dateFilter = 'AND date(entry_time) = date("now")';
        break;
      case 'week':
        dateFilter = 'AND entry_time >= date("now", "-7 days")';
        break;
      case 'month':
        dateFilter = 'AND entry_time >= date("now", "-30 days")';
        break;
      case 'all':
      default:
        dateFilter = '';
        break;
    }

    let tickerFilter = '';
    if (ticker) {
      tickerFilter = 'AND ticker = ?';
      params.push(ticker.toUpperCase());
    }

    // Get all closed trades for the period
    const tradesQuery = `
      SELECT * FROM trades 
      WHERE status = 'closed' AND (is_paper = 0 OR is_paper IS NULL) ${dateFilter} ${tickerFilter}
      ORDER BY entry_time DESC
    `;
    
    const trades = await this.db.all(tradesQuery, params);

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgWinner: 0,
        avgLoser: 0,
        profitFactor: 0,
        totalPnL: 0,
        bestTrade: null,
        worstTrade: null,
        setupAnalysis: {},
        dayOfWeekAnalysis: {}
      };
    }

    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    const scratches = trades.filter(t => t.pnl === 0);

    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = (winners.length / trades.length) * 100;
    
    const totalWinnings = winners.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));
    
    const avgWinner = winners.length > 0 ? totalWinnings / winners.length : 0;
    const avgLoser = losers.length > 0 ? totalLosses / losers.length : 0;
    
    const profitFactor = totalLosses > 0 ? totalWinnings / totalLosses : totalWinnings > 0 ? Infinity : 0;

    const bestTrade = trades.reduce((best, current) => 
      !best || current.pnl > best.pnl ? current : best, null);
    
    const worstTrade = trades.reduce((worst, current) => 
      !worst || current.pnl < worst.pnl ? current : worst, null);

    return {
      totalTrades: trades.length,
      winners: winners.length,
      losers: losers.length,
      scratches: scratches.length,
      winRate: Math.round(winRate * 100) / 100,
      avgWinner: Math.round(avgWinner * 100) / 100,
      avgLoser: Math.round(avgLoser * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      bestTrade: bestTrade ? {
        id: bestTrade.id,
        ticker: bestTrade.ticker,
        pnl: bestTrade.pnl,
        setup: bestTrade.setup_type
      } : null,
      worstTrade: worstTrade ? {
        id: worstTrade.id,
        ticker: worstTrade.ticker,
        pnl: worstTrade.pnl,
        setup: worstTrade.setup_type
      } : null,
      setupAnalysis: await this.getSetupAnalysis(trades),
      dayOfWeekAnalysis: this.getDayOfWeekAnalysis(trades)
    };
  }

  // Analyze performance by setup type
  async getSetupAnalysis(trades = null) {
    if (!trades) {
      const tradesQuery = 'SELECT * FROM trades WHERE status = "closed" AND (is_paper = 0 OR is_paper IS NULL)';
      trades = await this.db.all(tradesQuery);
    }

    const setupStats = {};
    
    trades.forEach(trade => {
      const setup = trade.setup_type || 'other';
      
      if (!setupStats[setup]) {
        setupStats[setup] = {
          totalTrades: 0,
          winners: 0,
          losers: 0,
          totalPnL: 0,
          winRate: 0,
          avgPnL: 0
        };
      }

      setupStats[setup].totalTrades++;
      setupStats[setup].totalPnL += trade.pnl;
      
      if (trade.pnl > 0) setupStats[setup].winners++;
      else if (trade.pnl < 0) setupStats[setup].losers++;
    });

    // Calculate win rates and averages
    Object.keys(setupStats).forEach(setup => {
      const stats = setupStats[setup];
      stats.winRate = Math.round((stats.winners / stats.totalTrades) * 10000) / 100;
      stats.avgPnL = Math.round((stats.totalPnL / stats.totalTrades) * 100) / 100;
      stats.totalPnL = Math.round(stats.totalPnL * 100) / 100;
    });

    return setupStats;
  }

  // Analyze performance by day of week
  getDayOfWeekAnalysis(trades = null) {
    if (!trades) {
      // For async version, this would need to be await, but we pass trades in from getStats
      return {};
    }

    const dayStats = {
      Monday: { totalTrades: 0, totalPnL: 0, winners: 0 },
      Tuesday: { totalTrades: 0, totalPnL: 0, winners: 0 },
      Wednesday: { totalTrades: 0, totalPnL: 0, winners: 0 },
      Thursday: { totalTrades: 0, totalPnL: 0, winners: 0 },
      Friday: { totalTrades: 0, totalPnL: 0, winners: 0 }
    };

    trades.forEach(trade => {
      const date = new Date(trade.entry_time);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (dayStats[dayName]) {
        dayStats[dayName].totalTrades++;
        dayStats[dayName].totalPnL += trade.pnl;
        if (trade.pnl > 0) dayStats[dayName].winners++;
      }
    });

    // Calculate win rates and averages
    Object.keys(dayStats).forEach(day => {
      const stats = dayStats[day];
      stats.winRate = stats.totalTrades > 0 ? 
        Math.round((stats.winners / stats.totalTrades) * 10000) / 100 : 0;
      stats.avgPnL = stats.totalTrades > 0 ?
        Math.round((stats.totalPnL / stats.totalTrades) * 100) / 100 : 0;
      stats.totalPnL = Math.round(stats.totalPnL * 100) / 100;
    });

    return dayStats;
  }

  // Get current streaks
  async getStreaks() {
    const tradesQuery = `
      SELECT pnl FROM trades 
      WHERE status = 'closed' AND (is_paper = 0 OR is_paper IS NULL)
      ORDER BY entry_time DESC
    `;
    
    const trades = await this.db.all(tradesQuery);
    
    if (trades.length === 0) {
      return {
        currentStreak: { type: 'none', count: 0 },
        bestWinStreak: 0,
        worstLossStreak: 0
      };
    }

    // Calculate current streak
    let currentStreak = { type: 'none', count: 0 };
    let streakType = null;
    
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      const isWin = trade.pnl > 0;
      const isLoss = trade.pnl < 0;
      
      if (i === 0) {
        if (isWin) streakType = 'win';
        else if (isLoss) streakType = 'loss';
        else streakType = 'scratch';
        currentStreak = { type: streakType, count: 1 };
      } else {
        if ((isWin && streakType === 'win') || (isLoss && streakType === 'loss') || (!isWin && !isLoss && streakType === 'scratch')) {
          currentStreak.count++;
        } else {
          break;
        }
      }
    }

    // Find best/worst streaks
    let bestWinStreak = 0;
    let worstLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    // Reverse to go chronologically
    trades.reverse().forEach(trade => {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
      } else if (trade.pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        worstLossStreak = Math.max(worstLossStreak, currentLossStreak);
      } else {
        // Scratch trade resets both streaks
        currentWinStreak = 0;
        currentLossStreak = 0;
      }
    });

    return {
      currentStreak,
      bestWinStreak,
      worstLossStreak
    };
  }

  // Get today's performance summary
  async getTodaysSummary() {
    const todayStats = await this.getStats('today');
    const openTrades = await this.db.getTrades({ open: true });
    
    // Calculate unrealized P&L for open positions (simplified - would need real-time prices)
    const openPositionsValue = openTrades.reduce((sum, trade) => sum + trade.cost_basis, 0);

    return {
      ...todayStats,
      openPositions: openTrades.length,
      openPositionsValue: Math.round(openPositionsValue * 100) / 100,
      todaysClosedTrades: todayStats.totalTrades
    };
  }

  // Format stats for display
  formatStats(stats) {
    const lines = [];
    lines.push(`📊 PERFORMANCE STATS`);
    lines.push(`${'═'.repeat(40)}`);
    lines.push(`Total Trades: ${stats.totalTrades}`);
    lines.push(`Winners: ${stats.winners} | Losers: ${stats.losers} | Scratches: ${stats.scratches}`);
    lines.push(`Win Rate: ${stats.winRate}%`);
    lines.push(`Avg Winner: $${stats.avgWinner} | Avg Loser: $${stats.avgLoser}`);
    lines.push(`Profit Factor: ${stats.profitFactor}`);
    lines.push(`Total P&L: $${stats.totalPnL}`);
    
    if (stats.bestTrade) {
      lines.push(`Best Trade: ${stats.bestTrade.ticker} +$${stats.bestTrade.pnl} (${stats.bestTrade.setup})`);
    }
    if (stats.worstTrade) {
      lines.push(`Worst Trade: ${stats.worstTrade.ticker} -$${Math.abs(stats.worstTrade.pnl)} (${stats.worstTrade.setup})`);
    }

    return lines.join('\n');
  }

  formatSetupAnalysis(setupStats) {
    const lines = [];
    lines.push(`🎯 SETUP ANALYSIS`);
    lines.push(`${'═'.repeat(50)}`);
    
    // Sort by total P&L descending
    const sortedSetups = Object.entries(setupStats)
      .sort(([,a], [,b]) => b.totalPnL - a.totalPnL);
    
    sortedSetups.forEach(([setup, stats]) => {
      lines.push(`${setup.toUpperCase()}: ${stats.totalTrades} trades, ${stats.winRate}% win rate, $${stats.totalPnL} total, $${stats.avgPnL} avg`);
    });

    return lines.join('\n');
  }

  formatStreaks(streaks) {
    const lines = [];
    lines.push(`🔥 STREAKS`);
    lines.push(`${'═'.repeat(30)}`);
    lines.push(`Current: ${streaks.currentStreak.count} ${streaks.currentStreak.type}${streaks.currentStreak.count !== 1 ? 's' : ''} in a row`);
    lines.push(`Best Win Streak: ${streaks.bestWinStreak}`);
    lines.push(`Worst Loss Streak: ${streaks.worstLossStreak}`);

    return lines.join('\n');
  }
}

module.exports = HorseyStats;