// Coordinate search over the structural league knobs, maximizing the multi-seed Realism Score (scripts/realism-bench.mjs --multi, training seeds 101-105).
// shootingLine is locked: only roster, minutes, usage and draft knobs move. Verify the winner on held-out seeds: --seeds 2001,2002,2003,2004,2005
// Usage: node scripts/tune-sweep.mjs [maxSeconds, default 230]
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
const BENCH = new URL('./realism-bench.mjs', import.meta.url).pathname, TMP = os.tmpdir() + '/tune-sweep-' + process.pid + '.json';
const GRID = {
  replLevel: [58, 60, 62, 64, 65], replVet: [56, 58, 60, 62, 64], usgDisp: [0, 0.05, 0.1, 0.15, 0.2, 0.3],
  sleeperP1: [0.03, 0.06, 0.1, 0.14], sleeperP2: [0, 0.02, 0.04, 0.07], sleeperCeil: [0, 80, 84, 88, 92],
  protectCeil: [0, 78, 82, 86], fillMins: [18, 22, 26], oneBall: [0.194, 0.197, 0.2],
};
// guard: a config is accepted only if it keeps these categories at or above the floor (the shot environment and parity are already calibrated)
const GUARD = { Environment: 85, Shooting: 82, Parity: 85 }, ok = (r) => Object.entries(GUARD).every(([c, v]) => r.sub[c] >= v);
const t0 = Date.now(), maxS = +process.argv[2] || 230;

function evalCfg(cfg) {
  execFileSync(process.execPath, [BENCH, '--multi', '--quiet'], { env: { ...process.env, NOUSER: '1', TUNE: JSON.stringify(cfg), JSON: TMP }, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(TMP, 'utf8'));
}
let best = {}, bestR = evalCfg(best), n = 1;
console.log(`start ${bestR.overall.toFixed(1)}%`);
outer: for (let round = 1; round <= 4; round++) {
  let improved = false;
  for (const k of Object.keys(GRID)) for (const v of GRID[k]) {
    if (best[k] === v) continue;
    if ((Date.now() - t0) / 1000 > maxS) break outer;
    const cfg = { ...best, [k]: v }, r = evalCfg(cfg); n++;
    if (ok(r) && r.overall > bestR.overall + 0.05) { best = cfg; bestR = r; improved = true; }
  }
  console.log(`round ${round}: ${bestR.overall.toFixed(1)}%  ${JSON.stringify(best)}`);
  if (!improved) break;
}
console.log(`${n} evals in ${((Date.now() - t0) / 1000).toFixed(0)}s  best ${bestR.overall.toFixed(1)}%  | ` + Object.entries(bestR.sub).map(([c, v]) => `${c} ${v.toFixed(0)}`).join('  '));
console.log('BEST ' + JSON.stringify(best));
fs.rmSync(TMP, { force: true });
