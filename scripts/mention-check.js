// "in the news": opponents/coaches mention you after games; every reply resolves and the quotes use real numbers
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; const R = { seasons: 0, offered: 0, replies: 0, bad: 0, kinds: {}, who: {}, perSeason: [] };
const fail = (m) => { R.bad++; if (R.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  R.seasons++; let n = 0;
  st.matchLog.forEach((it, i) => {
    if (it.k !== 'g' || it.dnp) return; st.matchIdx = i + 1;
    const ctx = G.mentionOpen(st, it); if (!ctx) return; n++; R.offered++;
    R.kinds[ctx.kind] = (R.kinds[ctx.kind] || 0) + 1; R.who[ctx.who.kind] = (R.who[ctx.who.kind] || 0) + 1;
    if (/\{|\}|undefined|NaN/.test(ctx.quote)) fail('bad quote ' + ctx.quote);
    if (ctx.kind === 'praise' && !['good', 'great', 'ok'].includes(ctx.game.grade)) fail('praise after a ' + ctx.game.grade + ' game (' + ctx.game.pts + ' pts)'); R.grades = R.grades || {}; R.grades[ctx.game.grade + '/' + ctx.kind] = (R.grades[ctx.game.grade + '/' + ctx.kind] || 0) + 1;
    if (R.replies < 40) { const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; c.dec.flags.mn = { y: c.league.year, n: 0 }; c.matchIdx = i + 1;
      let tries = 0; while (!Dc.offer(c, 'mention') && tries++ < 400) { c.dec.flags.mn.n = 0; c.dec.pending = null; c.matchIdx = i + 1; c.league.year += 0; }
      if (c.dec.pending) { const v = Dc.view(c); if (!v.options || v.options.length !== 4) fail('bad view'); const r = Dc.choose(c, ['respect', 'ignore', 'clap', 'fire'][R.replies % 4]); R.replies++; if (!r.done || !r.text) fail('no result'); } }
  });
  R.perSeason.push(n);
};
for (let i = 0; i < 6; i++) { N.setSeed(5100 + i); const st = G.newCareer({ name: 'm' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 4 }); st.autoPlay = false; G.auto(st, {}); }
const avg = R.perSeason.reduce((a, b) => a + b, 0) / R.perSeason.length, mx = Math.max.apply(null, R.perSeason);
console.log(JSON.stringify({ grades: R.grades, seasons: R.seasons, offered: R.offered, replies: R.replies, bad: R.bad, kinds: R.kinds, who: R.who, avgPerSeasonProbe: avg.toFixed(1), max: mx }));
if (R.bad || !R.offered) { console.log('FAILED'); process.exit(1); } console.log('mention OK');
