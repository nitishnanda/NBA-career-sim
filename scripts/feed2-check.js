// the timeline's new voice (critical, stat-citing, comparisons) and star-injury news pop-ups
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; const R = { posts: 0, bad: 0, withStat: 0, withCmp: 0, kinds: {}, inj: 0, injReplies: 0, injNames: new Set(), sample: [] };
const fail = (m) => { R.bad++; if (R.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  st.matchLog.forEach((it, i) => {
    if (it.k === 'g' && it.fan) { R.kinds[it.fk] = (R.kinds[it.fk] || 0) + 1; it.fan.forEach((p) => { R.posts++; if (/\{|\}|undefined|NaN|\s\s/.test(p.text) || p.text.length < 8) fail('bad post: ' + p.text); if (/\d/.test(p.text)) R.withStat++; if (/Jordan|Kobe|LeBron|Magic|Stockton|Paul|Curry|Wade|Harden|Durant|Pippen|Kawhi|Duncan|Garnett|Dirk|Giannis|Shaq|Hakeem|Jokic|Kareem|Bird|Barkley|Kidd|Klay|Russell/.test(p.text)) R.withCmp++; if (R.sample.length < 14 && Math.random() < 0.05) R.sample.push(p.text); }); }
    if (it.k !== 'g' || it.dnp) return;
    const ctx = G.starInjuryOpen(st, it); if (!ctx) return; R.inj++; R.injNames.add(ctx.inj);
    if (/undefined|NaN/.test(JSON.stringify(ctx))) fail('bad star injury ctx');
    if (R.injReplies < 30) { const c = JSON.parse(JSON.stringify(st)); c.autoPlay = false; c.dec.pending = null; c.dec.flags.si = { y: c.league.year, n: 0, ids: [] }; c.matchIdx = i + 1; let t = 0; while (!Dc.offer(c, 'starinjury') && t++ < 300) { c.dec.flags.si = { y: c.league.year, n: 0, ids: [] }; c.dec.pending = null; }
      if (c.dec.pending) { const v = Dc.view(c); if (v.options.length !== 3) fail('star inj options'); const r = Dc.choose(c, ['wishes', 'ignore', 'shade'][R.injReplies % 3]); R.injReplies++; if (!r.done || !r.text) fail('star inj result'); } }
  });
};
for (let i = 0; i < 5; i++) { N.setSeed(6100 + i); const st = G.newCareer({ name: 'f' + i, pos: ['SF', 'PG', 'C', 'SG', 'PF'][i], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 3 }); st.autoPlay = false; G.auto(st, {}); }
console.log(JSON.stringify({ posts: R.posts, bad: R.bad, statShare: (R.withStat / R.posts).toFixed(2), cmpShare: (R.withCmp / R.posts).toFixed(2), kinds: R.kinds, starInj: R.inj, replies: R.injReplies, injTypes: R.injNames.size }));
console.log(R.sample.join('\n'));
if (R.bad || !R.posts || !R.inj) { console.log('FAILED'); process.exit(1); } console.log('feed2 OK');
