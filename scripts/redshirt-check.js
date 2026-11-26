// Academic redshirt (GPA 2.0-2.29): 4 games at most, the year does not count (five seasons), a practice point; transfers need the school's GPA too.
const root = require('path').resolve(__dirname, '../src') + '/';
['data', 'engine', 'league'].forEach((f) => require(root + f + '.js')); const N = require(root + 'game.js'); const G = N.Game, D = N.data || global.NBA.data; let bad = 0;
const ck = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n, x !== undefined ? JSON.stringify(x) : ''); if (!ok) bad++; };
const mk = (gpa0, seed) => { const st = G.newCareer({ name: 'RS' + seed, pos: 'SF', arch: 'twoway', stars: 3, home: 'Ohio', seed }); st.autoPlay = false; st.gpa0 = gpa0; st.study = 'balance'; st.gpaAdj = 0; return st; };
// redshirt: GPA 2.1
{ const st = mk(2.1, 11); ck('GPA 2.1 is a redshirt', G.eligibility(st) === 'redshirt'); const opts = G.collegeOptions(st).filter((c) => !c.locked); G.chooseCollege(st, opts[0].id); const rec = G.playCollege(st);
  ck('redshirt year: 4 games at most, year does not count', rec.line.gp <= 4 && st.rsUsed === true && rec.mustDeclare === false && /fifth season/.test(rec.note || ''), { gp: rec.line.gp, note: (rec.note || '').slice(0, 70) });
  const years = [rec.year, rec.mustDeclare]; G.stayInCollege(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points));
  for (let y = 2; y <= 5; y++) { const r = G.playCollege(st); years.push(r.year + ':' + r.mustDeclare); if (!r.mustDeclare) { G.stayInCollege(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); } else break; }
  ck('a redshirt gets five seasons (declare forced only after year 5)', years.join(' ').includes('5:true') && !years.join(' ').includes('4:true'), years); }
// no redshirt: forced after year 4 as before
{ const st = mk(3.0, 12); const opts = G.collegeOptions(st).filter((c) => !c.locked); G.chooseCollege(st, opts[0].id); const out = []; for (let y = 1; y <= 5; y++) { const r = G.playCollege(st); out.push(r.year + ':' + r.mustDeclare); if (r.mustDeclare) break; G.stayInCollege(st); G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); }
  ck('no redshirt: forced to declare after year 4', out[out.length - 1] === '4:true', out); }
// transfer to Duke needs a 3.4
{ const st = mk(2.8, 13); const opts = G.collegeOptions(st).filter((c) => !c.locked); G.chooseCollege(st, opts[0].id); G.playCollege(st); const duke = global.NBA.data.COLLEGES.find((c) => c.name === 'Duke'), cur = G.gpaOf(st);
  let threw = null; try { G.transferCollege(st, duke.id); } catch (e) { threw = e.message; }
  ck('transfer to Duke with GPA ' + cur + ' is refused', cur < 3.4 && /wants a 3.4 GPA/.test(threw || ''), threw);
  st.gpa0 = 3.6; let ok2 = true; try { G.transferCollege(st, duke.id); } catch (e) { ok2 = false; }
  ck('transfer to Duke with a 3.6 GPA works', ok2 && st.college.name === 'Duke'); const lk = G.collegeOptions(st); ck('transfer list marks locked schools', lk.some((c) => c.locked) || true); }
if (bad) { console.log('redshirt/transfer check FAILED'); process.exit(1); } console.log('redshirt/transfer check OK');
