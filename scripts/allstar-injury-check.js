// All-Star weekend and injuries: an injured All-Star keeps the honour but sits the weekend out; a fit one plays; the game box ranks the user honestly (he used to be last by construction).
const root = require('path').resolve(__dirname, '../src') + '/';
['data', 'engine', 'league'].forEach((f) => require(root + f + '.js')); const N = require(root + 'game.js'); require(root + 'allstar.js'); const G = N.Game, D = N.Decisions;
let bad = 0; const ck = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name, extra !== undefined ? JSON.stringify(extra) : ''); if (!ok) bad++; };
let hurtDone = 0; const ranks = [];
for (let i = 0; i < 10; i++) {
  const st = G.newCareer({ name: 'P' + i, pos: ['SF', 'PG', 'SG'][i % 3], arch: ['generational', 'scorer', 'dominator'][i % 3], home: 'Ohio', seed: 900 + i, stars: 5 }); const seen = new Set();
  G.auto(st, { onDecision: (s) => {
    const R = s.asRoster; if (!R || !R.sel || seen.has(R.year)) return; seen.add(R.year);
    ['compete', 'cruise', 'showtime'].forEach((key) => { const g = N.AllStar._t.allStarGame(s, key); const mine = g.others.filter((o) => !/\(opp\)/.test(o[0])).map((o) => o[1]).concat([g.pts]).sort((a, b) => b - a); ranks.push({ r: (mine.indexOf(g.pts) + 1) / mine.length, last: mine.indexOf(g.pts) === mine.length - 1 && mine.length > 3 }); });
    if (hurtDone < 3) { hurtDone++; s.autoPlay = false;
      for (const hurt of [true, false]) { delete D.state(s).flags.asw; s.matchLog = [{ k: 'g', n: 52, dnp: hurt ? 'Knee sprain' : 'Rest', ib: hurt ? 1 : undefined }, { k: 'hdr', asw: 1 }, { k: 'g', n: 53, dnp: hurt ? 'Knee sprain' : undefined, ib: hurt ? 1 : undefined }]; s.matchIdx = 1;
        const ok = N.AllStar.start(s), f = D.state(s).flags.asw, steps = JSON.stringify(f.steps), intro = N.AllStar.view(s).text || '';
        if (hurt) ck('hurt All-Star: no game, no contests', ok && steps === '["intro","recap"]' && !!f.hurt && /out with a knee sprain/.test(intro), steps);
        else ck('fit All-Star plays the game', ok && f.steps.includes('game') && !f.hurt, steps); }
      s.autoPlay = true; } } });
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
ck('All-Star box: the user ranks mid-roster on average, not last', ranks.length > 20 && avg(ranks.map((x) => x.r)) > 0.3 && avg(ranks.map((x) => x.r)) < 0.7, { games: ranks.length, meanRankFraction: +avg(ranks.map((x) => x.r)).toFixed(2) });
ck('All-Star box: the user is the lowest scorer on his team in under a quarter of games', ranks.filter((x) => x.last).length / ranks.length < 0.25, { last: ranks.filter((x) => x.last).length, of: ranks.length });
if (bad) { console.log('allstar-injury-check FAILED (' + bad + ')'); process.exit(1); } console.log('allstar-injury-check OK');
