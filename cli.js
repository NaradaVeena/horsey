#!/usr/bin/env node

const { program } = require('commander');
const HorseyDB = require('./db');
const HorseyStats = require('./stats');
const HorseyDashboard = require('./dashboard');

const db = new HorseyDB();
const stats = new HorseyStats(db);
const dashboard = new HorseyDashboard(db, stats);

// Helper function to parse levels
function parseLevels(levelString) {
  if (!levelString) return null;
  return levelString.split(',').map(l => parseFloat(l.trim())).filter(l => !isNaN(l));
}

// Helper function to format table
function formatTable(headers, rows) {
  if (rows.length === 0) {
    return 'No data found.';
  }
  
  const columnWidths = headers.map((header, i) => 
    Math.max(header.length, ...rows.map(row => String(row[i] || '').length))
  );
  
  const separator = '+' + columnWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const headerRow = '|' + headers.map((h, i) => ` ${h.padEnd(columnWidths[i])} `).join('|') + '|';
  
  const dataRows = rows.map(row => 
    '|' + row.map((cell, i) => ` ${String(cell || '').padEnd(columnWidths[i])} `).join('|') + '|'
  );
  
  return [separator, headerRow, separator, ...dataRows, separator].join('\n');
}

// Add main narrative command
const narrativeCmd = program.command('narrative').alias('n').description('Manage trading narratives');

narrativeCmd
  .command('add <ticker> <text>')
  .description('Add a new narrative')
  .option('--direction <direction>', 'bull, bear, or neutral', 'neutral')
  .option('--levels <levels>', 'comma-separated price levels')
  .option('--invalidation <price>', 'invalidation price', parseFloat)
  .option('--timeframe <timeframe>', 'intraday, swing, or multi-day', 'intraday')
  .action(async (ticker, text, options) => {
    try {
      const id = await db.addNarrative(ticker, text, {
        direction: options.direction,
        levels: parseLevels(options.levels),
        invalidation: options.invalidation,
        timeframe: options.timeframe
      });
      console.log(`✅ Added narrative #${id} for ${ticker.toUpperCase()}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

narrativeCmd
  .command('list')
  .description('List narratives')
  .option('--active', 'show only active narratives')
  .option('--ticker <ticker>', 'filter by ticker')
  .action(async (options) => {
    try {
      const narratives = await db.getNarratives(options);
      
      if (narratives.length === 0) {
        console.log('No narratives found.');
        return;
      }
      
      const rows = narratives.map(n => [
        n.id,
        n.ticker,
        n.direction,
        n.status,
        n.narrative.substring(0, 50) + (n.narrative.length > 50 ? '...' : ''),
        n.key_levels ? n.key_levels.join(',') : '',
        n.invalidation || '',
        new Date(n.created_at).toLocaleDateString()
      ]);
      
      console.log('\n📊 NARRATIVES');
      console.log(formatTable(
        ['ID', 'Ticker', 'Dir', 'Status', 'Narrative', 'Levels', 'Invalid', 'Date'],
        rows
      ));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

narrativeCmd
  .command('update <id>')
  .description('Update narrative status')
  .option('--status <status>', 'triggered, invalidated, expired')
  .action(async (id, options) => {
    try {
      if (!options.status) {
        console.error('❌ Status is required (triggered, invalidated, expired)');
        return;
      }
      
      await db.updateNarrativeStatus(parseInt(id), options.status);
      console.log(`✅ Updated narrative #${id} to ${options.status}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Add main watch command
const watchCmd = program.command('watch').alias('w').description('Manage watchlist');

watchCmd
  .command('add <ticker> <setup>')
  .description('Add to watchlist')
  .option('--levels <levels>', 'comma-separated price levels')
  .option('--bias <bias>', 'long, short, or neutral', 'neutral')
  .option('--priority <priority>', 'priority 1-5', parseInt, 3)
  .option('--flow <note>', 'options flow note')
  .action(async (ticker, setup, options) => {
    try {
      const id = await db.addToWatchlist(ticker, setup, {
        levels: parseLevels(options.levels),
        bias: options.bias,
        priority: options.priority,
        flow: options.flow
      });
      console.log(`✅ Added ${ticker.toUpperCase()} to watchlist (#${id})`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

watchCmd
  .command('list')
  .description('Show watchlist')
  .option('--date <date>', 'specific date or "today"', 'today')
  .option('--active', 'show only active items')
  .action(async (options) => {
    try {
      const watchlist = await db.getWatchlist(options);
      
      if (watchlist.length === 0) {
        console.log('No watchlist items found.');
        return;
      }
      
      const rows = watchlist.map(w => [
        w.id,
        w.ticker,
        w.bias,
        '⭐'.repeat(w.priority),
        w.status,
        w.setup.substring(0, 30) + (w.setup.length > 30 ? '...' : ''),
        w.key_levels ? JSON.stringify(w.key_levels).substring(0, 20) + '...' : '',
        w.options_flow_note ? w.options_flow_note.substring(0, 20) + '...' : ''
      ]);
      
      console.log('\n👀 WATCHLIST');
      console.log(formatTable(
        ['ID', 'Ticker', 'Bias', 'Pri', 'Status', 'Setup', 'Levels', 'Flow'],
        rows
      ));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

watchCmd
  .command('update <id>')
  .description('Update watchlist item')
  .option('--status <status>', 'triggered, skipped, missed')
  .action(async (id, options) => {
    try {
      if (!options.status) {
        console.error('❌ Status is required (triggered, skipped, missed)');
        return;
      }
      
      await db.updateWatchlistStatus(parseInt(id), options.status);
      console.log(`✅ Updated watchlist #${id} to ${options.status}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

watchCmd
  .command('clear')
  .description('Clear old watchlist items')
  .action(async () => {
    try {
      const result = await db.clearWatchlist();
      console.log(`✅ Cleared ${result.changes} old watchlist items`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Add main trade command
const tradeCmd = program.command('trade').alias('t').description('Manage trades');

tradeCmd
  .command('open <ticker> <direction> <instrument> <entry_price> <size>')
  .description('Open a new trade')
  .option('--setup <setup>', 'setup type', 'other')
  .option('--narrative <id>', 'narrative ID', parseInt)
  .option('--watchlist <id>', 'watchlist ID', parseInt)
  .option('--risk <amount>', 'planned risk amount', parseFloat)
  .option('--target <amount>', 'planned target amount', parseFloat)
  .option('--notes <notes>', 'trade notes')
  .action(async (ticker, direction, instrument, entryPrice, size, options) => {
    try {
      const validDirections = ['long', 'short'];
      const validInstruments = ['shares', 'calls', 'puts', '0dte-calls', '0dte-puts', 'csp'];
      
      if (!validDirections.includes(direction)) {
        console.error('❌ Direction must be: long, short');
        return;
      }
      
      if (!validInstruments.includes(instrument)) {
        console.error('❌ Instrument must be: shares, calls, puts, 0dte-calls, 0dte-puts, csp');
        return;
      }
      
      const id = await db.openTrade(ticker, direction, instrument, parseFloat(entryPrice), parseInt(size), {
        setup: options.setup,
        narrative: options.narrative,
        watchlist: options.watchlist,
        risk: options.risk,
        target: options.target,
        notes: options.notes
      });
      
      const costBasis = parseFloat(entryPrice) * parseInt(size);
      console.log(`✅ Opened trade #${id}: ${direction.toUpperCase()} ${ticker.toUpperCase()} ${instrument} @ $${entryPrice} (${size}x, $${costBasis.toFixed(2)} basis)`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

tradeCmd
  .command('close <id> <exit_price>')
  .description('Close a trade')
  .option('--notes <notes>', 'closing notes')
  .option('--lessons <lessons>', 'lessons learned')
  .action(async (id, exitPrice, options) => {
    try {
      await db.closeTrade(parseInt(id), parseFloat(exitPrice), options);
      console.log(`✅ Closed trade #${id} @ $${exitPrice}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

tradeCmd
  .command('list')
  .description('List trades')
  .option('--open', 'show only open trades')
  .option('--date <date>', 'specific date or "today"')
  .option('--ticker <ticker>', 'filter by ticker')
  .action(async (options) => {
    try {
      const trades = await db.getTrades(options);
      
      if (trades.length === 0) {
        console.log('No trades found.');
        return;
      }
      
      const rows = trades.map(t => [
        t.id,
        t.ticker,
        t.direction,
        t.instrument,
        `$${t.entry_price.toFixed(2)}`,
        t.exit_price ? `$${t.exit_price.toFixed(2)}` : '-',
        t.pnl ? `$${t.pnl.toFixed(2)}` : 'OPEN',
        t.setup_type,
        t.status,
        new Date(t.entry_time).toLocaleDateString()
      ]);
      
      console.log('\n📈 TRADES');
      console.log(formatTable(
        ['ID', 'Ticker', 'Dir', 'Inst', 'Entry', 'Exit', 'P&L', 'Setup', 'Status', 'Date'],
        rows
      ));
      
      // Show totals
      const closedTrades = trades.filter(t => t.status === 'closed');
      if (closedTrades.length > 0) {
        const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const winners = closedTrades.filter(t => t.pnl > 0).length;
        const winRate = (winners / closedTrades.length) * 100;
        console.log(`\nTotals: ${closedTrades.length} trades, ${winRate.toFixed(1)}% win rate, $${totalPnL.toFixed(2)} P&L`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Add main journal command  
const journalCmd = program.command('journal').alias('j').description('Trading journal');

journalCmd
  .command('plan <plan>')
  .description('Set premarket plan')
  .action(async (plan) => {
    try {
      await db.setPlan(plan);
      console.log('✅ Set premarket plan for today');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

journalCmd
  .command('review <review>')
  .description('Set postmarket review')
  .option('--grade <grade>', 'trading grade A-F')
  .option('--context <context>', 'market context')
  .action(async (review, options) => {
    try {
      await db.setReview(review, options);
      console.log('✅ Set postmarket review for today');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

journalCmd
  .command('show')
  .description('Show journal entry')
  .option('--date <date>', 'specific date (YYYY-MM-DD)')
  .action(async (options) => {
    try {
      const journal = await db.getJournal(options.date);
      
      if (!journal) {
        console.log('No journal entry found for the specified date.');
        return;
      }
      
      console.log(`\n📝 JOURNAL - ${journal.date}`);
      console.log('═'.repeat(50));
      
      if (journal.premarket_plan) {
        console.log('\n📋 PREMARKET PLAN:');
        console.log(journal.premarket_plan);
      }
      
      if (journal.postmarket_review) {
        console.log('\n📊 POSTMARKET REVIEW:');
        console.log(journal.postmarket_review);
      }
      
      if (journal.market_context) {
        console.log('\n🌍 MARKET CONTEXT:');
        console.log(journal.market_context);
      }
      
      if (journal.grade) {
        console.log(`\n📈 GRADE: ${journal.grade}`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Stats commands
program
  .command('stats')
  .alias('s')
  .description('Trading statistics')
  .option('--period <period>', 'today, week, month, or all', 'all')
  .option('--ticker <ticker>', 'filter by ticker')
  .action(async (options) => {
    try {
      const result = await stats.getStats(options.period, options.ticker);
      console.log(stats.formatStats(result));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

program
  .command('setups')
  .description('Setup analysis')
  .action(async () => {
    try {
      const setupStats = await stats.getSetupAnalysis();
      console.log(stats.formatSetupAnalysis(setupStats));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

program
  .command('streaks')
  .description('Winning/losing streaks')
  .action(async () => {
    try {
      const streaks = await stats.getStreaks();
      console.log(stats.formatStreaks(streaks));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Dashboard command
program
  .command('generate')
  .alias('dash')
  .description('Generate HTML dashboard')
  .action(async () => {
    try {
      const path = await dashboard.save();
      console.log(`✅ Dashboard generated: ${path}`);
      console.log('🌐 Will be served at: narada.galigutta.com/horsey/');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Paper trades
const paperCmd = program.command('paper').alias('p').description('Paper trades (muscle building)');

paperCmd
  .command('open <ticker> <direction> <instrument> <entry_price> <size>')
  .description('Open a paper trade')
  .option('--setup <setup>', 'setup type', 'other')
  .option('--narrative <id>', 'narrative ID', parseInt)
  .option('--notes <notes>', 'trade notes')
  .action(async (ticker, direction, instrument, entryPrice, size, options) => {
    try {
      const validDirections = ['long', 'short'];
      const validInstruments = ['shares', 'calls', 'puts', '0dte-calls', '0dte-puts', 'csp'];
      if (!validDirections.includes(direction)) { console.error('❌ Direction must be: long, short'); return; }
      if (!validInstruments.includes(instrument)) { console.error('❌ Instrument must be: shares, calls, puts, 0dte-calls, 0dte-puts, csp'); return; }
      
      const id = await db.openTrade(ticker, direction, instrument, parseFloat(entryPrice), parseInt(size), {
        setup: options.setup, narrative: options.narrative, notes: options.notes, paper: true
      });
      const mult = instrument === 'shares' ? 1 : 100;
      console.log(`📝 Paper trade #${id}: ${direction.toUpperCase()} ${ticker.toUpperCase()} ${size}x ${instrument} @ $${entryPrice}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

paperCmd
  .command('close <id> <exit_price>')
  .description('Close a paper trade')
  .option('--notes <notes>', 'closing notes')
  .action(async (id, exitPrice, options) => {
    try {
      await db.closeTrade(parseInt(id), parseFloat(exitPrice), options);
      console.log(`📝 Closed paper trade #${id} @ $${exitPrice}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

paperCmd
  .command('list')
  .description('List paper trades')
  .option('--open', 'show only open')
  .action(async (options) => {
    try {
      const trades = await db.getTrades({ ...options, paper: true });
      if (trades.length === 0) { console.log('No paper trades.'); return; }
      const rows = trades.map(t => [
        t.id, t.ticker, t.direction, t.instrument, t.size,
        '$' + t.entry_price.toFixed(2),
        t.exit_price ? '$' + t.exit_price.toFixed(2) : '-',
        t.pnl ? '$' + t.pnl.toFixed(2) : 'OPEN',
        t.setup_type, t.status
      ]);
      console.log('\n📝 PAPER TRADES');
      const header = ['ID', 'Ticker', 'Dir', 'Inst', 'Qty', 'Entry', 'Exit', 'P&L', 'Setup', 'Status'];
      const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
      const line = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
      console.log(line);
      console.log('| ' + header.map((h, i) => h.padEnd(widths[i])).join(' | ') + ' |');
      console.log(line);
      rows.forEach(r => console.log('| ' + r.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |'));
      console.log(line);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Parse and execute
program.version('1.0.0');
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.help();
}