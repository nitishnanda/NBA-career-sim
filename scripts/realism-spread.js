// Spread diagnostics for the realism test: per archetype, mean and standard deviation of each career stat, sim vs real.
// A sim spread much narrower than real means careers follow one template (that is what makes "copies").
// Usage: node scripts/realism-spread.js <dump dir from realism-run.sh (DUMPDIR=...)>
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; const REAL = require('../data/real-careers.json');
const pool = {}; fs.readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); Object.keys(d).forEach((k) => { pool[k] = (pool[k] || []).concat(d[k]); }); });
const CF = ['pts', 'reb', 'ast', 'ts', 'mpg', 'peakAge', 'seasons', 'finalAge', 'n30', 'best', 'allstar', 'allnba', 'mvp', 'alldef', 'gpRate'];
const done = (x) => x.last <= 2024 || x.debut <= 2008;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
Object.keys(REAL).forEach((arch) => {
  const sim = pool[arch] || [], real = REAL[arch].filter(done); if (sim.length < 8) return;
  console.log(`\n${arch} (${sim.length} sim, ${real.length} finished real)` + '\n  stat        real mean±sd      sim mean±sd    spread ratio');
  CF.forEach((k) => { const r = real.map((x) => x[k]).filter((v) => v != null), s = sim.map((x) => x[k]).filter((v) => v != null); if (!r.length || !s.length) return;
    const ratio = sd(s) / (sd(r) || 1e-9); console.log('  ' + k.padEnd(10) + (mean(r).toFixed(1) + '±' + sd(r).toFixed(1)).padStart(14) + (mean(s).toFixed(1) + '±' + sd(s).toFixed(1)).padStart(16) + ratio.toFixed(2).padStart(10) + (ratio < 0.6 ? '  << too uniform' : ratio > 1.6 ? '  >> too wide' : '')); });
});
