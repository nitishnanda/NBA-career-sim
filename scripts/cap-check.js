// contracts and the cap: payrolls look like a real league, the market respects cap room, options and extensions work, trades must match salaries
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions, C = N.Cap; const S = { teams: 0, over: 0, under: 0, tax: 0, markets: 0, capped: 0, exts: 0, supers: 0, opts: 0, optDeclined: 0, popts: 0, trades: 0, tradeBlocked: 0, bad: 0 }; const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  const L = st.league, cap = N.capFor(L.year);
  L.teams.forEach((t) => { const f = C.finance(st, t); S.teams++; if (f.payroll > f.cap) S.over++; else S.under++; if (f.overTax) S.tax++; if (!(f.payroll > 0.6 * cap && f.payroll < 1.6 * cap)) fail('payroll range ' + f.payroll / cap); const sh = C.sheet(st, t); if (!sh.length) fail('empty sheet'); });
  const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.autoPlay = false; c.dec.pending = null;
  const k = JSON.stringify(rec.gp).length;
  // an expiring contract: the market respects cap room
  { const e = JSON.parse(JSON.stringify(c)); e.contract.left = 0; let d; try { d = G.decisionOptions(e); } catch (x) { fail('market ' + x.message); return; }
    if (d.market) { S.markets++; d.market.forEach((m) => { if (!m.cap) { fail('no cap info'); return; } const cc = d.neg[m.teamId]; if (m.cap.capped) S.capped++; if (m.salary > m.cap.max + 0.05) fail('offer above max ' + m.salary + ' ' + m.cap.max); if (cc.maxSal > m.cap.max + 0.05) fail('neg max above club max'); if (m.cap.kind !== 'Cap room' && m.cap.max > 0.1 * cap) fail('exception too big ' + m.cap.max); }); } }
  // an extension with one year left
  { const e = JSON.parse(JSON.stringify(c)); e.contract.left = 1; e.contract.next = null; e.contract.opt = null; let d; try { d = G.decisionOptions(e); } catch (x) { fail('ext ' + x.message); return; }
    if (d.extension) { const ex = d.extension; S.exts++; if (/Supermax/.test(ex.kind)) S.supers++; e.decision = d; try { G.decide(e, 'extend', { salary: ex.salary, years: ex.years }); } catch (x) { fail('extend ' + x.message); return; }
      if (!e.contract.next || e.contract.next.salary !== ex.salary) fail('extension not stored'); } }
  // a player option on the last year
  { const e = JSON.parse(JSON.stringify(c)); e.contract.left = 1; e.contract.opt = { type: 'player' }; let d; try { d = G.decisionOptions(e); } catch (x) { fail('popt ' + x.message); return; }
    if (!d.playerOption) { if (!e.contract.optDeclined && !d.expiring) fail('no player option shown'); } else { S.popts++; e.decision = d; const r = G.decide(e, 'option', { take: false }); if (e.contract.left !== 0 || !r.reopen) fail('opt out'); } }
  // a rookie team option
  if (c.contract.type === 'rookie' && c.contract.teamOpt) { for (const left of [2, 1]) { const e = JSON.parse(JSON.stringify(c)); e.contract.left = left; delete e.contract.optYear; let d; try { d = G.decisionOptions(e); } catch (x) { fail('topt ' + x.message); return; } S.opts++; if (e.contract.optDeclined === e.league.year) { S.optDeclined++; if (!d.expiring || e.contract.left !== 0) fail('declined option should expire'); } } }
  // trades: salaries must match for a club over the cap
  { const e = JSON.parse(JSON.stringify(c)); e.contract.left = 3; const offers = G.tradeOffers(e, 12); offers.forEach((o) => { S.trades++; if (!o.ok && /salaries have to match/.test(o.reason || '')) S.tradeBlocked++; if (o.partner && !(o.partner.salary > 0)) fail('partner salary'); }); }
};
for (let i = 0; i < 6; i++) { N.setSeed(2900 + i); const st = G.newCareer({ name: 'C' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify(S));
if (S.bad || !S.markets || !S.exts) { console.log('FAILED'); process.exit(1); } console.log('cap OK');
