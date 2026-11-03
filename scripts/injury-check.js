// injuries with stakes: a long injury opens a decision; each choice edits the games the way it says and the lasting damage scales with it
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; const R = { seasons: 0, injuries: 0, major: 0, tests: 0, bad: 0, delta: {}, dmg: {} };
const fail = (m) => { R.bad++; if (R.bad < 8) console.log('FAIL', m); };
const played = (st) => st.matchLog.filter((x) => x.k === 'g' && !x.po && !x.dnp).length;
N.onSeasonLog = (st, rec) => {
  R.seasons++; const i = st.matchLog.findIndex((x) => x.k === 'g' && x.inj); if (i < 0) return;
  R.injuries++; const it = st.matchLog[i]; if (it.inj.major) R.major++;
  const keys = it.inj.major ? ['surgery', 'rehab', 'rush'] : ['rest', 'standard', 'rush'];
  keys.forEach((k) => {
    const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.matchIdx = i; c.autoPlay = false;
    const base = played(c); c.dec.pending = null; if (!Dc.offer(c, 'injury')) { fail('no decision offered'); return; }
    const v = Dc.view(c); if (!v.options || v.options.length !== 3 || !v.games) fail('bad view');
    const r = Dc.choose(c, k); R.tests++;
    if (!r.done || !r.text) fail('not done');
    const after = played(c), dl = after - base; R.delta[k] = (R.delta[k] || []).concat([dl]);
    const ch = c.dec.flags.injChoice; if (!ch || ch.key !== k) fail('no choice stored');
    if (c.matchLog.some((x) => x.k === 'g' && !x.po && !x.dnp && x.pt == null)) fail('played game without stats');
    const rc = c.proSeasons[c.proSeasons.length - 1]; if (rc.gp !== after) fail('rec.gp ' + rc.gp + ' vs ' + after);
    // the end of the year
    if (it.inj.major) { if (!c.injDamage) c.injDamage = { ath: 5, dur: 4, tath: 3 }; const a0 = c.player.attrs.ath; G.decisionOptions(c); R.dmg[k] = (R.dmg[k] || []).concat([a0 - c.player.attrs.ath]); }
  });
};
for (let i = 0; i < 30; i++) {
  N.setSeed(3100 + i); const st = G.newCareer({ name: 'i' + i, pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 3 + (i % 3) });
  st.autoPlay = false; G.auto(st, {});
}
const avg = (a) => (a && a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : 'n/a');
console.log(JSON.stringify({ seasons: R.seasons, injuries: R.injuries, major: R.major, tests: R.tests, bad: R.bad, games_delta: { surgery: avg(R.delta.surgery), rehab: avg(R.delta.rehab), rush: avg(R.delta.rush), rest: avg(R.delta.rest), standard: avg(R.delta.standard) }, ath_lost: { surgery: avg(R.dmg.surgery), rehab: avg(R.dmg.rehab), rush: avg(R.dmg.rush) } }));
if (R.bad || !R.tests) { console.log('FAILED'); process.exit(1); }
console.log('injury OK');
