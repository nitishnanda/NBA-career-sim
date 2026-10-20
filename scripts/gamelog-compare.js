// Does the sim's per-game generator reproduce real game-to-game behaviour?
// For every real player-season we feed the real *average line* into genGame and compare triple-doubles, big scoring games and spread.
// Usage: node scripts/gamelog-compare.js   (needs data/real-player-season-games.csv from scripts/real-gamelogs.py)
require('../src/data.js'); require('../src/engine.js'); const N = require('../src/engine.js'); N.setSeed(4242);
const fs = require('fs');
const lines = fs.readFileSync(__dirname + '/../data/real-player-season-games.csv', 'utf8').trim().split('\n'); const head = lines[0].split(',');
const rows = lines.slice(1).map((l) => { const c = l.split(','); const o = {}; head.forEach((h, i) => (o[h] = isNaN(+c[i]) || c[i] === '' ? c[i] : +c[i])); return o; }).filter((r) => r.type === 'rg');
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const NSAMP = 3000;
function simSeason(r, mins) {
  let td = 0, g30 = 0, g40 = 0, g50 = 0, sp = [], sr = [], sa = [];
  for (let i = 0; i < NSAMP; i++) {
    const g = N.genGame({ mins, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: 2.5 });
    const cats = [g.pts, g.reb, g.ast, g.stl, g.blk].filter((x) => x >= 10).length; if (cats >= 3) td++;
    if (g.pts >= 30) g30++; if (g.pts >= 40) g40++; if (g.pts >= 50) g50++; sp.push(g.pts); sr.push(g.reb); sa.push(g.ast);
  }
  const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
  return { td: td / NSAMP, g30: g30 / NSAMP, g40: g40 / NSAMP, g50: g50 / NSAMP, sdp: sd(sp), sdr: sd(sr), sda: sd(sa) };
}
// ---- triple-double candidates
const cand = rows.filter((r) => r.g >= 30 && r.reb >= 6.5 && r.ast >= 6.5 && r.pts >= 12);
const bins = [[6.5, 8], [8, 9.2], [9.2, 10.2], [10.2, 11.5], [11.5, 20]];
console.log('TRIPLE-DOUBLES: real vs sim, by min(reb, ast) of the season average   (' + cand.length + ' real seasons, sim = 3000 games each at 35 min)');
console.log('min(reb,ast)'.padEnd(14), 'seasons'.padStart(8), 'real TD% '.padStart(10), 'sim TD% '.padStart(10));
bins.forEach(([lo, hi]) => { const x = cand.filter((r) => Math.min(r.reb, r.ast) >= lo && Math.min(r.reb, r.ast) < hi); if (!x.length) return;
  let real = 0, g = 0, sim = 0; x.forEach((r) => { real += r.td; g += r.g; sim += simSeason(r, 35).td * r.g; });
  console.log((lo + '-' + hi).padEnd(14), String(x.length).padStart(8), (100 * real / g).toFixed(1).padStart(10), (100 * sim / g).toFixed(1).padStart(10)); });
const tot = (f) => { let real = 0, g = 0, sim = 0; cand.forEach((r) => { real += r.td; g += r.g; sim += simSeason(r, 35).td * r.g; }); return [100 * real / g, 100 * sim / g]; };
const [rt, st] = tot(); console.log('ALL candidates'.padEnd(14), String(cand.length).padStart(8), rt.toFixed(1).padStart(10), st.toFixed(1).padStart(10));
// ---- big scoring games by ppg
console.log('\nBIG SCORING GAMES per 82, by season ppg (real vs sim, g>=50)');
console.log('ppg'.padEnd(10), 'seasons'.padStart(8), '30+ real/sim'.padStart(16), '40+ real/sim'.padStart(16), '50+ real/sim'.padStart(16));
[[18, 22], [22, 25], [25, 28], [28, 31], [31, 40]].forEach(([lo, hi]) => { const x = rows.filter((r) => r.g >= 50 && r.pts >= lo && r.pts < hi); if (!x.length) return;
  const S = x.map((r) => simSeason(r, 35)); const per = (k, sk) => [avg(x.map((r) => r[k] / r.g * 82)), avg(S.map((s) => s[sk] * 82))];
  const a = per('g30', 'g30'), b = per('g40', 'g40'), c = per('g50', 'g50');
  console.log((lo + '-' + hi).padEnd(10), String(x.length).padStart(8), (a[0].toFixed(1) + ' / ' + a[1].toFixed(1)).padStart(16), (b[0].toFixed(2) + ' / ' + b[1].toFixed(2)).padStart(16), (c[0].toFixed(2) + ' / ' + c[1].toFixed(2)).padStart(16)); });
// ---- spread
const star = rows.filter((r) => r.g >= 50 && r.pts >= 20);
const S2 = star.map((r) => simSeason(r, 35));
console.log('\nGAME-TO-GAME SPREAD (sd as a share of the average), players averaging 20+ ppg: real / sim');
console.log('points   ', avg(star.map((r) => r.sd_pts / r.pts)).toFixed(3), '/', avg(star.map((r, i) => S2[i].sdp / r.pts)).toFixed(3));
console.log('rebounds ', avg(star.map((r) => r.sd_reb / Math.max(.5, r.reb))).toFixed(3), '/', avg(star.map((r, i) => S2[i].sdr / Math.max(.5, r.reb))).toFixed(3));
console.log('assists  ', avg(star.map((r) => r.sd_ast / Math.max(.5, r.ast))).toFixed(3), '/', avg(star.map((r, i) => S2[i].sda / Math.max(.5, r.ast))).toFixed(3));
