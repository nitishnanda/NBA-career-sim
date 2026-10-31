// the following: it exists for a human career, grows with the season, every social moment option resolves and moves it the way it says, and sponsors pay for reach
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, Sx = N.Social, Lg = N.Legacy; const S = { seasons: 0, years: 0, moments: 0, viral: 0, backfire: 0, offers: 0, tempo: 0, contractPosts: 0, bad: 0, startF: [], endF: [] }; const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  S.seasons++; const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.autoPlay = false; c.dec.pending = null;
  const s0 = Sx.state(c).f; if (!(s0 > 0)) fail('no following'); if (c.proSeasons.length === 1) S.startF.push(s0);
  try { G.decisionOptions(c); } catch (e) { fail('decisionOptions ' + e.message); return; } const s1 = Sx.state(c); S.years++; if (!s1.hist.length) fail('no history'); if (!/^@/.test(s1.handle)) fail('handle'); S.endF.push(s1.f);
  const gi = c.matchLog.findIndex((x, k) => k > 3 && x.k === 'g' && !x.dnp && !x.po); if (gi < 0) return; c.matchIdx = gi + 1; ['hype', 'thanks', 'clap', 'quiet'].forEach((key, ki) => { const e = JSON.parse(JSON.stringify(c)); e.dec.pending = null; if (!Dc.offer(e, 'social')) { fail('no social moment'); return; } const v = Dc.view(e); if (v.options.length !== 4 || /\{|undefined/.test(v.text)) fail('bad social view ' + v.text);
    const before = Sx.state(e).f, r = Dc.choose(e, key); S.moments++; if (!r.text || !r.done) fail('social no result'); const after = Sx.state(e).f; if (key === 'hype' && after < before) fail('hype lowered followers'); if (key === 'clap') { if (after > before * 1.03) S.viral++; else S.backfire++; } });
  // sponsors pay for reach
  { const e = JSON.parse(JSON.stringify(c)); Sx.state(e).f = 4000; e.brand = { score: 80, deals: [], offers: null, earned: 0, year: null }; e.agent = 'guru'; const offs = Lg.endorseOffers(e); S.offers += offs.length; if (offs.some((o) => o.id === 'tempo')) S.tempo++;
    const e2 = JSON.parse(JSON.stringify(c)); Sx.state(e2).f = 40; e2.brand = { score: 80, deals: [], offers: null, earned: 0, year: null }; if (Lg.endorseOffers(e2).some((o) => o.id === 'tempo')) fail('social deal with 40K followers'); if (!(Sx.mult(e) > Sx.mult(e2))) fail('reach multiplier'); }
};
for (let i = 0; i < 6; i++) { N.setSeed(3400 + i); const st = G.newCareer({ name: 'S' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
// growth over a career: a star's following climbs for years, a role player's stays small
{ const N2 = N; N2.setSeed(77); const st = G.newCareer({ name: 'Grow', pos: 'SF', arch: 'generational', stars: 5 }); st.player.attrs.three = 90; const f0 = Sx.state(st).f; st.proSeasons.push({ awards: ['All-Star', 'MVP'], label: 'x' }); st.brand = { score: 60, deals: [], offers: null, earned: 0, year: null }; st.league.year = 2030;
  for (let y = 0; y < 6; y++) { st.league.year++; Sx.year(st); } const fS = Sx.state(st).f; const st2 = G.newCareer({ name: 'Role', pos: 'SF', arch: 'defender', stars: 2 }); st2.proSeasons.push({ awards: [], label: 'x' }); st2.league.year = 2030; for (let y = 0; y < 6; y++) { st2.league.year++; Sx.year(st2); } const fR = Sx.state(st2).f;
  S.growth = { start: Math.round(f0), star: Math.round(fS), role: Math.round(fR) }; if (!(fS > 3000 && fR < fS / 5)) fail('growth ' + JSON.stringify(S.growth)); }
console.log(JSON.stringify({ growth: S.growth, seasons: S.seasons, years: S.years, moments: S.moments, viral: S.viral, backfire: S.backfire, offers: S.offers, tempo: S.tempo, startAvg: Math.round(S.startF.reduce((a, b) => a + b, 0) / S.startF.length), endMax: Math.max.apply(null, S.endF), bad: S.bad }));
if (S.bad || !S.moments) { console.log('FAILED'); process.exit(1); } console.log('social OK');
