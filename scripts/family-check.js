// family money and need-based scholarships; the EuroLeague and G League keep running through any career
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, Dc = N.Decisions; let bad = 0; const t = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const mk = (o) => { N.setSeed(o.seed || 7); return G.newCareer(Object.assign({ name: 'F', pos: 'SG', arch: 'scorer' }, o)); };
// the matrix
[['wealthy', 3], ['comfortable', 3], ['working', 3], ['poor', 3], ['poor', 5], ['working', 4]].forEach(([fam, stars]) => {
  const st = mk({ family: fam, stars }), a = (w) => G.canAfford(st, w).ok, sch = G.needScholarship(st);
  if (fam === 'wealthy') t(a('prep') && a('walkon') && a('abroad') && a('usroute'), 'wealthy affords everything');
  if (fam === 'comfortable') t(a('prep') && a('walkon') && a('abroad') && !a('usroute'), 'comfortable: all but the US move');
  if ((fam === 'working' || fam === 'poor') && stars < 4) t(!a('prep') && !a('walkon') && !a('abroad') && !a('usroute') && !sch, fam + ' 3-star: nothing paid');
  if ((fam === 'working' || fam === 'poor') && stars >= 4) t(sch && a('prep') && a('abroad') && a('usroute') && !a('walkon'), fam + ' ' + stars + '-star: scholarship covers prep, abroad, US');
});
t(mk({ stars: 3 }).family.tier === 'comfortable', 'default family');
// HS prep locked for a poor 3-star, open for a poor 5-star
{ const st = mk({ family: 'poor', stars: 3 }); st.autoPlay = false; Dc.offer(st, 'hs'); const v = Dc.view(st); t(v.options[0].key === 'prep' && v.options[0].locked, 'prep locked'); let threw = false; try { Dc.choose(st, 'prep'); } catch (e) { threw = true; } t(threw, 'prep choose blocked'); }
{ const st = mk({ family: 'poor', stars: 5 }); st.autoPlay = false; Dc.offer(st, 'hs'); const v = Dc.view(st); t(!v.options[0].locked && /scholarship/.test(v.options[0].blurb), 'prep on scholarship'); }
// walk-on reach schools: offered to people, locked without money
{ const st = mk({ family: 'poor', stars: 2 }); st.autoPlay = false; const o = G.collegeOptions(st), w = o.filter((x) => x.walkOn); t(w.length >= 1 && w.every((x) => x.locked), 'poor walk-on locked'); let threw = false; try { G.chooseCollege(st, w[0].id, true); } catch (e) { threw = true; } t(threw, 'walk-on blocked'); }
{ const st = mk({ family: 'wealthy', stars: 2 }); st.autoPlay = false; const o = G.collegeOptions(st), w = o.filter((x) => x.walkOn); t(w.length >= 1 && w.every((x) => !x.locked), 'wealthy walk-on open'); G.chooseCollege(st, w[0].id, true); t(st.walkOn, 'walk-on set'); const r = G.playCollege(st); t(r.line.mins < 30, 'walk-on smaller role'); G.stayInCollege(st); t(st.bonusPoints >= 1, 'private trainers'); }
{ const st = mk({ stars: 3 }); st.autoPlay = true; t(!G.collegeOptions(st).some((x) => x.walkOn), 'autopilot sees no walk-on options'); }
// abroad academies and the US road
{ const st = mk({ family: 'poor', stars: 3, origin: 'uk' }); const o = G.intlOptions(st); t(o.some((x) => !x.home && x.locked), 'abroad academy locked'); let threw = false; try { G.intlToUS(st); } catch (e) { threw = true; } t(threw, 'US road blocked'); }
{ const st = mk({ family: 'poor', stars: 5, origin: 'serbia' }); const o = G.intlOptions(st); t(o.filter((x) => !x.home).every((x) => !x.locked && x.paidBy === 'scholarship'), 'abroad on scholarship'); G.intlToUS(st); t(st.stage === 'hs', 'US road on scholarship'); }
// the showcase plan falls back without money
{ const st = mk({ family: 'working', stars: 3, origin: 'greece' }); G.chooseClub(st, G.intlOptions(st).filter((x) => x.home)[0].id); st.intlPlan = 'showcase'; const r = G.playIntl(st); t(r.plan === 'team', 'showcase not affordable -> team'); }
// the leagues keep running through an NBA career (people, not bulk autopilot)
{ const st = mk({ family: 'comfortable', stars: 4 }); st.autoPlay = false; G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); const e1 = N.Euro.league(st, 'el').season; t(e1 && e1.table.length === 20, 'EuroLeague played during college'); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (N.Decisions.state(st).pending) N.Decisions.autoResolve(st); G.playSeason(st); const e2 = N.Euro.league(st, 'gl').season; t(e2 && e2.year === st.league.year, 'G League played during the NBA season'); }
console.log(bad ? 'FAILED' : 'family OK'); process.exit(bad ? 1 : 0);
