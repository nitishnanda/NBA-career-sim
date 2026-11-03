// the timeline: notable games carry posts, events (draft, awards, trades, signings) land in the feed, no slot is left unfilled
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game; const S = { seasons: 0, gameFans: 0, kinds: {}, events: {}, bad: 0, likes: 0 };
const chk = (posts, where) => posts.forEach((p) => { if (!p.who || !p.text || /\{|\}/.test(p.text) || /undefined|NaN/.test(p.text) || !(p.likes > 0)) { S.bad++; if (S.bad < 6) console.log('BAD post', where, JSON.stringify(p)); } else S.likes++; });
N.onSeasonLog = (st, rec) => { S.seasons++; st.matchLog.forEach((x) => { if (x.fan) { S.gameFans++; S.kinds[x.fk] = (S.kinds[x.fk] || 0) + 1; chk(x.fan, 'game ' + x.fk); } }); };
for (let i = 0; i < 20; i++) {
  N.setSeed(2400 + i); const st = G.newCareer({ name: 'f' + i, pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 3 + (i % 3) });
  st.autoPlay = false; G.auto(st, {}); st.autoPlay = true;
  ((st.dec.flags.feed) || []).forEach((e) => { S.events[e.kind] = (S.events[e.kind] || 0) + 1; chk(e.posts, 'event ' + e.kind); });
}
console.log(JSON.stringify(S));
if (S.bad || !S.gameFans || !S.events.draft || !S.events.award) { console.log('FAILED'); process.exit(1); }
console.log('feed OK');
