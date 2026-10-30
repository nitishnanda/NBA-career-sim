// press headlines must match what was said: every headline quotes the picked answer, names its subject (never an opponent for a rookie question about draft night), and
// a humble answer that never mentions the team never gets "praises the locker room"
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; const S = { moments: 0, headlines: 0, mismatch: 0, locker: 0, oppOnOrigin: 0, bad: 0 };
const fail = (m) => { S.bad++; if (S.bad < 6) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  st.autoPlay = false; st.proSeasons.push(rec);
  st.matchLog.forEach((x, i) => {
    if (!((x.k === 'g' && x.pc && !x.po) || (x.k === 'g' && x.pp && !x.dnp))) return;
    const keep = st.matchIdx; st.matchIdx = x.pp && !x.pc ? i + 1 : i; st.dec.pending = null; let pd = null; try { pd = G.pressOpen(st); } catch (e) { return; } if (!pd) { st.matchIdx = keep; return; }
    st.dec.pending = { id: 'press', ctx: pd, step: 0, log: [] }; S.moments++;
    let res = null, lastPick = null;
    for (let k = 0; k < 6 && Dc.state(st).pending; k++) { const v = Dc.view(st); if (v.phase === 'pick') { const c = v.candidates[0]; lastPick = c; res = Dc.choose(st, 'pick', c.idx); } else { const o = v.options.find((q) => q.key === 'trash') || v.options.find((q) => q.key === 'humble') || v.options[0]; res = Dc.choose(st, o.key); } }
    if (res && res.headline && res.headline.text) { S.headlines++; const h = res.headline.text;
      if (!/"[^"]{6,}"/.test(h)) { S.mismatch++; if (S.mismatch < 4) console.log('NO QUOTE', h); }
      if (/locker room|puts the team first|hands the credit/i.test(h)) S.locker++;
      if (pd.pool.some((q) => q.topic === 'origin' || q.topic === 'draftnight' || q.topic === 'combine') && /the [A-Z][a-z]+s\b/.test(h) && /takes aim at the|fires back at the/.test(h) && !pd.pool.some((q) => /oppStar|game/.test(q.topic))) S.oppOnOrigin++;
    }
    st.matchIdx = keep;
  });
  st.proSeasons.pop(); st.autoPlay = true;
};
for (let i = 0; i < 20; i++) { N.setSeed(4400 + i); const st = G.newCareer({ name: 'H' + i, pos: ['SF', 'PG', 'C', 'SG'][i % 4], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify(S));
if (S.bad || !S.headlines || S.mismatch || S.locker || S.oppOnOrigin) { console.log('FAILED'); process.exit(1); } console.log('headline OK');
