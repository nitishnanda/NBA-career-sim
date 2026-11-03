// What picking each archetype gets you: simulate N careers per archetype (any outcome, not only the ones that become notable), take the typical (median)
// career, name the real player closest to it, list the archetype's best real players, and count how often a pick reaches the top. Writes the
// typical / best / odds lines into src/data.js (between the archetype's existing fields), so the picker cards show them.
// Usage: node scripts/arch-cards.js [careers per archetype, default 200]   DRY=1 prints only; CACHE=file keeps the simulated careers to re-run the matching
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const G = require('../src/game.js').Game;
const fs = require('fs'), path = require('path'), D = NBA.data;
const REAL = require('../data/real-careers.json'); const N = +process.argv[2] || 200;
const perfOf = (s) => s.pts * (1 + 2.2 * ((s.ts || 0.57) - 0.57)) + 1.15 * s.reb + 1.5 * s.ast + 2 * (s.stl + s.blk) - 1.1 * (s.tov || 0);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
// every finished real career since 1980, role players too (data/real-comps.json, scripts/real-comps.py): the pool the typical pick is matched against,
// on the peak line, the style (steals + blocks, share of shots from three), the honours and the career length (scale of each)
const POOL = require('../data/real-comps.json');
const KEYS = [['pts', 3], ['reb', 1.6], ['ast', 1.4], ['defn', 0.6], ['ar3', 0.1], ['allstar', 2.5], ['allnba', 2], ['mvp', 0.8], ['seasons', 3]];
const out = {};
Object.keys(D.ARCHETYPES).forEach((arch, ai) => {
  const mix = {}; REAL[arch].forEach((r) => { mix[r.pos] = (mix[r.pos] || 0) + 1; }); const pk = Object.keys(mix), tot = pk.reduce((t, k) => t + mix[k], 0);
  const cached = process.env.CACHE && fs.existsSync(process.env.CACHE) ? JSON.parse(fs.readFileSync(process.env.CACHE, 'utf8'))[arch] : null;
  const C = cached || [];
  for (let i = 0; i < (cached ? 0 : N); i++) {
    NBA.setSeed(424242 + ai * 1000 + i); let u = NBA.rand() * tot, pos = pk[0]; for (const k of pk) { u -= mix[k]; if (u <= 0) { pos = k; break; } }
    const st = G.newCareer({ name: 'x', pos: ['PG', 'SG', 'SF', 'PF', 'C'].includes(pos) ? pos : 'SF', arch, home: 'Ohio', seed: 5150000 + ai * 100000 + i }); G.auto(st);
    const ps = st.proSeasons.map((s) => Object.assign({ perf: perfOf(s) }, s)), q = ps.filter((s) => s.gp >= 45), aw = st.career.awards;
    const t5 = (q.length ? q : ps).slice().sort((a, b) => b.perf - a.perf).slice(0, 5), m = (k) => (t5.length ? mean(t5.map((s) => s[k] || 0)) : 0);
    C.push({ pts: m('pts'), reb: m('reb'), ast: m('ast'), perf: m('perf'), defn: m('stl') + m('blk'), ar3: t5.length ? mean(t5.map((s) => (s.fga ? (s.tpa || 0) / s.fga : 0))) : 0, allstar: aw['All-Star'] || 0, allnba: aw['All-NBA'] || 0, mvp: aw.MVP || 0, an1: aw['All-NBA 1st Team'] || 0, titles: st.career.titles || 0, seasons: ps.filter((s) => s.gp >= 20).length });
  }
  if (process.env.CACHE && !cached) { const all = fs.existsSync(process.env.CACHE) ? JSON.parse(fs.readFileSync(process.env.CACHE, 'utf8')) : {}; all[arch] = C; fs.writeFileSync(process.env.CACHE, JSON.stringify(all)); }
  // the typical pick: the median of each part of the career line
  const T = {}; KEYS.forEach(([k]) => (T[k] = med(C.map((c) => c[k]))));
  // the closest real careers; of the four nearest, the two who scored the most career points (the names people know)
  const comp = POOL.map((r) => ({ r, d: KEYS.reduce((t, [k, sc]) => t + ((r[k] - T[k]) / sc) ** 2, 0) })).sort((a, b) => a.d - b.d).slice(0, +process.env.NEAR || 4).sort((a, b) => b.r.careerPts - a.r.careerPts).slice(0, 2).map((x) => x.r.player);
  // the best real careers of the archetype by honours (and big scoring / triple-doubles); the scoring archetypes only count players who scored like one (cohort median ppg or more)
  const fame = (r) => r.allnba + 2 * r.mvp + 0.5 * r.allstar + 0.5 * r.alldef + 0.5 * Math.max(0, r.pts - 20) + (r.td >= 30 ? 3 : 0);
  const mdPts = med(REAL[arch].map((r) => r.pts)), styleOk = (r) => !['scorer', 'shooter'].includes(arch) || r.pts >= mdPts;
  const best = REAL[arch].filter(styleOk).sort((a, b) => fame(b) - fame(a)).slice(0, 5).map((r) => r.player);
  const share = (f) => C.filter(f).length / C.length, tenths = (x) => Math.round(10 * x);
  const o = { allstar: share((c) => c.allstar >= 1), allstar5: share((c) => c.allstar >= 5), allnba: share((c) => c.allnba >= 1), mvp: share((c) => c.mvp >= 1), great: share((c) => c.mvp >= 2 || c.an1 >= 5), ring: share((c) => c.titles >= 1) };
  const line = Math.round(T.pts) + '/' + Math.round(T.reb) + '/' + Math.round(T.ast);
  const typical = line + ' at the peak, ' + (T.allstar ? T.allstar + ' All-Star' + (T.allstar > 1 ? 's' : '') : 'no All-Star nods') + (T.allnba ? ', ' + T.allnba + ' All-NBA' : '') + ', ' + T.seasons + ' seasons: ' + (/^[AEIOU]/.test(comp[0]) ? 'an ' : 'a ') + comp.join(' / ') + ' career';
  const pc = (x) => (x > 0 && x < 0.01 ? 'under 1%' : Math.round(100 * x) + '%');
  const odds = arch === 'generational' ? 'About ' + tenths(Math.max(o.mvp, o.great)) + ' in 10 reach MVP level (' + pc(o.mvp) + ' win one); ' + pc(o.allnba) + ' make All-NBA'
    : pc(o.allstar) + ' make an All-Star team · ' + pc(o.allnba) + ' All-NBA' + (o.mvp > 0 ? ' · ' + pc(o.mvp) + ' win an MVP' : '');
  out[arch] = { typical, best: best.join(' · '), odds };
  console.log(arch.padEnd(13), JSON.stringify(T), '| comp', comp.join(', '), '| odds', Object.entries(o).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' '));
  console.log('   typical:', typical, '\n   best:', out[arch].best, '\n   odds:', odds);
});
if (!process.env.DRY) {
  const f = path.join(__dirname, '..', 'src', 'data.js'); let s = fs.readFileSync(f, 'utf8');
  Object.keys(out).forEach((arch) => {
    const re = new RegExp('(\\n    ' + arch + ': \\{\\n[\\s\\S]*?comps: [^\\n]*\\n)(      typical: [^\\n]*\\n      best: [^\\n]*\\n      odds: [^\\n]*\\n)?');
    const lines = ['typical', 'best', 'odds'].map((k) => '      ' + k + ': ' + JSON.stringify(out[arch][k]).replace(/'/g, "\\'").replace(/^"|"$/g, "'") + ',\n').join('');
    if (!re.test(s)) throw new Error('no archetype block for ' + arch);
    s = s.replace(re, (m0, head) => head + lines);
  });
  fs.writeFileSync(f, s); console.log('wrote typical / best / odds into src/data.js');
}
