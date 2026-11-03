// v122 grades: the GPA opens and closes college doors (human careers only; the autopilot's college list is unchanged)
require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = require('../src/game.js'), G = N.Game, D = N.data;
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
// 1. the autopilot never sees the new schools or GPA locks
for (let i = 0; i < 40; i++) { N.setSeed(i); const st = G.newCareer({ name: 'A' + i, pos: 'SF', arch: 'scorer', stars: 1 + (i % 5) }); st.autoPlay = true; const o = G.collegeOptions(st); if (o.some((c) => c.added || c.ivy || (c.locked && !c.walkOn))) fail('autopilot saw a GPA school/lock'); }
// 2. study focus moves the GPA; eligibility thresholds hold
N.setSeed(3); const st = G.newCareer({ name: 'Study Test', pos: 'PG', arch: 'shooter', stars: 3, family: 'working' }); st.autoPlay = false;
const g0 = G.gpaOf(st); G.setStudy(st, 'books'); const g1 = G.gpaOf(st); G.setStudy(st, 'gym'); const g2 = G.gpaOf(st);
if (!(g1 > g0 && g2 < g0)) fail('study focus ' + [g0, g1, g2]);
st.gpaAdj = -5; if (G.eligibility(st) !== 'ineligible') fail('under 2.0 should be ineligible'); const lo = G.collegeOptions(st); if (lo.some((c) => !c.locked)) fail('ineligible but a D1 school is open');
let threw = false; try { G.chooseCollege(st, lo[0].id, false); } catch (e) { threw = true; } if (!threw) fail('ineligible student enrolled');
st.gpaAdj = 0; st.gpaAdj = 2.15 - G.gpaOf(st); if (G.eligibility(st) !== 'redshirt') fail('2.15 should be an academic redshirt ' + G.gpaOf(st));
const open = G.collegeOptions(st).find((c) => !c.locked); G.chooseCollege(st, open.id, !!open.walkOn); const yr1 = G.collegeSeason ? G.collegeSeason(st) : null;
// 3. a 3.9 student hears from the Ivy League, need-based aid for a working family, and academic schools unlock
N.setSeed(4); const iv = G.newCareer({ name: 'Ivy Test', pos: 'SG', arch: 'shooter', stars: 2, family: 'working', home: 'New York' }); iv.autoPlay = false; iv.gpaAdj = 3.9 - G.gpaOf(iv);
const io = G.collegeOptions(iv), ivy = io.filter((c) => c.ivy);
if (ivy.length !== 2 || !ivy.every((c) => !c.locked && c.aid && c.aid.full)) fail('ivy offers ' + JSON.stringify(ivy.map((c) => [c.name, c.locked, c.aid])));
G.chooseCollege(iv, ivy[0].id, false); if (!iv.college.ivy) fail('enrolled not flagged ivy');
const wealthy = G.newCareer({ name: 'Rich Test', pos: 'SG', arch: 'shooter', stars: 2, family: 'wealthy' }); wealthy.autoPlay = false; if (G.ivyAid(wealthy).full) fail('a wealthy family got a full ride');
// 4. a 2.9 student cannot get into Duke-level schools
N.setSeed(5); const mid = G.newCareer({ name: 'Mid Test', pos: 'SF', arch: 'scorer', stars: 5 }); mid.autoPlay = false; mid.gpaAdj = 2.9 - G.gpaOf(mid);
const duke = D.COLLEGES.find((c) => c.name === 'Duke'); let t2 = false; try { G.chooseCollege(mid, duke.id, false); } catch (e) { t2 = /GPA/.test(e.message); } if (!t2) fail('2.9 got into Duke');
// 5. prep year: a year older, grades up, once
N.setSeed(6); const pr = G.newCareer({ name: 'Prep Test', pos: 'C', arch: 'defender', stars: 2 }); pr.autoPlay = false; pr.gpaAdj = 1.8 - G.gpaOf(pr); const age = pr.player.age; G.prepYear(pr);
if (!(pr.player.age === age + 1 && Math.abs(G.gpaOf(pr) - 2.25) < 0.02)) fail('prep year ' + pr.player.age + ' ' + G.gpaOf(pr)); let t3 = false; try { G.prepYear(pr); } catch (e) { t3 = true; } if (!t3) fail('second prep year allowed');
console.log(JSON.stringify({ study: [g0, g1, g2], ivy: ivy.map((c) => c.name), redshirtYear1: yr1 ? yr1.line.gp + ' gp, ' + yr1.note : 'n/a' }));
console.log(bad ? 'FAILED' : 'gpa OK'); process.exit(bad ? 1 : 0);
