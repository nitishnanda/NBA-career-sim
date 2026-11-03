// workout invites: generated once a year, answerable once, accepting changes ratings and relationships, a second yes costs games
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; let made = 0, none = 0, yes = 0, bad = 0; const types = {};
for (let i = 0; i < 30; i++) {
  N.setSeed(2000 + i); const st = G.newCareer({ name: 'inv' + i, pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 2 + (i % 4) });
  st.autoPlay = false; for (let k = 0; k < 6 && !st.retired; k++) { G.auto(st, { seasons: 1 }); }
  const inv = Dc.invites(st); if (Dc.invites(st) !== inv) bad++;
  if (!inv.list.length) { none++; continue; } made++;
  inv.list.forEach((m) => { types[m.type] = (types[m.type] || 0) + 1; });
  const m = inv.list[0], before = m.skill ? st.player.attrs[m.skill] : 0, rel0 = Dc.relOf(st, m.id);
  const r = Dc.answerInvite(st, m.id, true); yes++;
  if (m.state !== 'yes' || Dc.relOf(st, m.id) <= rel0 || (m.skill && st.player.attrs[m.skill] < before)) { bad++; console.log('BAD accept', m.type); }
  try { Dc.answerInvite(st, m.id, true); bad++; console.log('BAD double answer'); } catch (e) { /* expected */ }
  if (inv.list[1]) { Dc.answerInvite(st, inv.list[1].id, false); if (inv.list[1].state !== 'no') bad++; }
}
console.log({ made, none, yes, types, bad }); process.exit(bad ? 1 : 0);
