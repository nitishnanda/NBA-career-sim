// pick ownership: every club holds its picks, trades move real picks, the draft order follows the owners, and your own trades carry picks and a second player
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Pk = N.Picks; const S = { seasons: 0, picksAway: 0, offers: 0, withPicks: 0, twoForOne: 0, executed: 0, ownersMoved: 0, orderOwners: 0, bad: 0 }; const fail = (m) => { S.bad++; if (S.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  S.seasons++; const L = st.league, P = Pk.ensure(L), ks = Object.keys(P);
  if (ks.length !== 8 * L.teams.length) fail('pick count ' + ks.length);
  L.teams.forEach((t) => { const n = Pk.ofTeam(L, t.id).length; if (n < 0 || n > 30) fail('team picks ' + n); });
  S.picksAway = Math.max(S.picksAway, ks.filter((k) => P[k].owner !== P[k].orig).length);
  const ord = N.lotteryOrder(L), orig = L._draftOrig[L.year]; ord.forEach((t, i) => { const want = Pk.ownerOf(L, L.year, i < 30 ? 1 : 2, orig[i]); if (t.id !== want) fail('order owner'); else if (want !== orig[i]) S.orderOwners++; });
  const c = JSON.parse(JSON.stringify(st)); c.stage = 'season_play'; c.proSeasons.push(rec); c.autoPlay = false; c.dec.pending = null; c.contract.left = 3;
  const offers = G.tradeOffers(c, 12); offers.forEach((o) => { S.offers++; if (o.pickKeys && o.pickKeys.length) S.withPicks++; if (o.extra) S.twoForOne++; });
  const ok = offers.find((o) => o.ok && o.pickKeys && o.pickKeys.length && (!o.extra || true));
  if (ok) { c.decision = { tradeOptions: offers }; const oldId = c.teamId, before = ok.pickKeys.map((k) => c.league.picks[k].owner); try { G.decide(c, 'trade', { teamId: ok.teamId }); S.executed++; } catch (e) { fail('trade ' + e.message); return; }
    ok.pickKeys.forEach((k, i) => { if (c.league.picks[k].owner !== oldId) fail('pick did not move'); else if (before[i] !== oldId) S.ownersMoved++; });
    if (ok.extra && c.league.players[ok.extra.id].teamId !== oldId) fail('extra did not move'); if (c.dec.flags.tradePrice == null) fail('no trade price flag'); }
};
for (let i = 0; i < 6; i++) { N.setSeed(3000 + i); const st = G.newCareer({ name: 'K' + i, pos: ['SF', 'PG', 'C'][i % 3], arch: ['scorer', 'twoway', 'shooter'][i % 3], stars: 3 + (i % 3) }); G.auto(st, {}); }
console.log(JSON.stringify(S));
if (S.bad || !S.offers || !S.executed) { console.log('FAILED'); process.exit(1); } console.log('picks OK');
