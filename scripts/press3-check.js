// rookie press: no questions about a pro past he does not have, no "last game" before game one, no trash talk before there is anything to trash-talk about,
// and questions about his college and high school years do come up
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions;
const S = { rookies: 0, moments: 0, origin: 0, combine: 0, draftnight: 0, kinds: {}, originTexts: {}, past: 0, lead: 0, lastGame: 0, trashEarly: 0, unfilled: 0, bad: 0 }; const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
const PAST = /tough on you before|different from last year|since you came into the league|been here before|all these years|last season|(?<!in your )last year|rookie year|a lifetime ago/i;
N.onSeasonLog = (st, rec) => {
  if (st.player.yearsPro !== 0) return; S.rookies++; const log = st.matchLog;
  log.forEach((x, i) => {
    if (!((x.k === 'g' && x.pc && !x.po) || (x.k === 'hdr' && x.ps != null && x.pc))) return;
    const keep = st.matchIdx; st.matchIdx = i; st.dec.pending = null; st.autoPlay = false; if (x.k === 'hdr') st.poPlans = Object.assign({}, st.poPlans, { [x.ps]: 'balanced' });
    let pd = null; try { pd = G.pressOpen(st); } catch (e) { fail('open ' + e.stack.split('\n').slice(0, 2).join('|')); }
    if (pd) { S.moments++; const c = pd.c || {};
      pd.pool.forEach((q) => {
        if (/loudest voice|leader of this team|whose team is it|face of a franchise|What do you tell him\?|lead this team|take charge/i.test(q.text)) { S.lead++; if (S.lead < 4) console.log('LEAD', q.text); }
        if (PAST.test(q.text)) { S.past++; if (S.past < 4) console.log('PAST', q.text); }
        if (x.k === 'g' && x.n === 1 && /last game/i.test(q.text)) S.lastGame++;
        if (x.k === 'g' && x.n <= 2 && !x.po && q.opts.some((o) => o.key === 'trash' || o.key === 'fight')) { S.trashEarly++; if (S.trashEarly < 4) console.log('TRASH EARLY', x.n, q.text); }
        if (q.topic === 'combine') S.combine++; if (q.topic === 'draftnight') S.draftnight++; if (q.topic === 'combine' || q.topic === 'draftnight') S.kinds[q.text.slice(0, 40)] = 1;
        if (q.topic === 'origin') { S.origin++; S.originTexts[q.text.slice(0, 60)] = 1; }
        if (/\{/.test(q.text) || q.opts.some((o) => !o.line || /\{/.test(o.line))) { S.unfilled++; if (S.unfilled < 4) console.log('UNFILLED', q.text, q.opts.map((o) => o.line).join(' | ')); }
      }); }
    st.matchIdx = keep; st.autoPlay = true;
  });
};
for (let i = 0; i < 60; i++) { N.setSeed(3900 + i); const st = G.newCareer({ name: 'P' + i, pos: ['SF', 'PG', 'C', 'SG'][i % 4], arch: ['scorer', 'twoway', 'defender', 'shooter'][i % 4], stars: 3 + (i % 3) }); G.auto(st, {}); }
S.originKinds = Object.keys(S.originTexts).length; delete S.originTexts; S.draftCombineKinds = Object.keys(S.kinds).length; delete S.kinds;
console.log(JSON.stringify(S));
if (S.bad || S.lead || S.past || S.lastGame || S.trashEarly || S.unfilled || !S.origin || !S.combine || !S.draftnight) { console.log('FAILED'); process.exit(1); } console.log('press3 OK');
