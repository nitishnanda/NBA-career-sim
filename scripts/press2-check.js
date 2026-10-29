// press conferences as a cast and a story: every press moment offers a pool of questions from named reporters, answering runs the pick-then-answer flow,
// the room remembers (quotes, tally, feuds, headlines), callbacks and feuds show up later, and nothing is left with an unfilled slot
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions;
const S = { seasons: 0, moments: 0, answered: 0, bad: 0, src: {}, callbacks: 0, feuds: 0, headlines: 0, fans: 0, pools: {}, take2: 0, personas: {}, reporters: {} };
const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  S.seasons++; st.proSeasons.push(rec); st.autoPlay = false; const log = st.matchLog;
  log.forEach((x, i) => {
    const pre = (x.k === 'g' && x.pc && !x.po) || (x.k === 'hdr' && x.ps != null && x.pc), post = x.k === 'g' && x.pp && !x.dnp; if (!pre && !post) return;
    const keep = st.matchIdx; st.matchIdx = post ? i + 1 : i; if (x.k === 'hdr') st.poPlans = Object.assign({}, st.poPlans, { [x.ps]: 'balanced' });
    st.dec.pending = null; let pd = null; try { pd = G.pressOpen(st); } catch (e) { fail('open ' + e.stack.split('\n').slice(0, 2).join('|')); }
    if (!pd) { st.matchIdx = keep; return; }
    st.dec.pending = { id: 'press', ctx: pd, step: 0, log: [] }; S.moments++;
    S.pools[pd.pool.length] = (S.pools[pd.pool.length] || 0) + 1; if (pd.take === 2) S.take2++;
    if (pd.pool.length < 2) fail('pool too small');
    pd.pool.forEach((q) => { S.src[q.src] = (S.src[q.src] || 0) + 1; if (!q.reporter || !q.reporter.name || !q.reporter.outlet) fail('no reporter');
      if (/\{/.test(q.text) || q.opts.length < 3 || q.opts.some((o) => !o.line || /\{/.test(o.line))) fail('unfilled: ' + q.text + ' | ' + q.opts.map((o) => o.line).join(' / ')); S.reporters[q.reporter.name] = (S.reporters[q.reporter.name] || 0) + 1; });
    // answer it like a person: pick the most dramatic question, trash talk if offered, else the first option
    let res = null;
    for (let k = 0; k < 6 && Dc.state(st).pending; k++) {
      const v = Dc.view(st);
      if (v.phase === 'pick') { const c = v.candidates.slice().sort((a, b) => b.heat - a.heat)[0]; res = Dc.choose(st, 'pick', c.idx); if (c.src === 'callback') S.callbacks++; if (c.src === 'feud') S.feuds++; }
      else { const o = v.options.find((x) => x.key === 'trash') || v.options.find((x) => x.key === 'confident') || v.options[0]; res = Dc.choose(st, o.key); S.answered++; }
    }
    if (Dc.state(st).pending) fail('press never finished');
    if (!res || !res.done) fail('no final result'); else { if (res.headline && res.headline.text) S.headlines++; else fail('no headline'); if (res.fans && res.fans.length >= 3) S.fans++; else fail('no fans'); if (res.persona) S.personas[res.persona] = (S.personas[res.persona] || 0) + 1; }
    st.matchIdx = keep;
  });
  st.proSeasons.pop(); st.autoPlay = true;
};
for (let i = 0; i < 16; i++) { N.setSeed(1700 + i); const st = G.newCareer({ name: 'p' + i, pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify(S));
const per = S.moments / Math.max(1, S.seasons);
console.log('press moments per season', per.toFixed(1));
if (S.bad || !S.moments || !S.callbacks || !S.feuds || !S.src.mem || per > 6) { console.log('FAILED'); process.exit(1); }
console.log('press2 OK');
