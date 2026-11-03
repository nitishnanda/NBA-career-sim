// preseason / late-season / playoff injuries and the minutes limit after a return
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game; const R = { seasons: 0, inj: 0, pre: 0, late: 0, poPartial: 0, poOut: 0, mm: 0, bad: 0, gpDiff: 0 };
const fail = (m) => { R.bad++; if (R.bad < 8) console.log('FAIL', m); };
N.onSeasonLog = (st, rec) => {
  R.seasons++; const ml = st.matchLog, reg = ml.filter((x) => x.k === 'g' && !x.po), po = ml.filter((x) => x.k === 'g' && x.po), ib = reg.filter((x) => x.ib);
  const inf = st.injInfo;
  if (inf) { R.inj++; if (inf.when === 'pre' && ib.length >= 10) { R.pre++; if (!reg[0].dnp) fail('pre injury but game 1 played'); }
    if (inf.when === 'late' && (ib.length >= 3)) { R.late++; if (!reg[81] || !reg[81].dnp) fail('late injury but last game played'); if (inf.po >= 99) { R.poOut++; if (po.some((x) => !x.dnp)) fail('out for playoffs but played'); } else if (inf.po > 0 && po.length) { R.poPartial++; const out = po.filter((x) => x.dnp).length; if (out > inf.po || (out < inf.po && out < po.length)) fail('po out ' + out + ' vs ' + inf.po); } } }
  const mm = reg.filter((x) => x.mm); R.mm += mm.length; mm.forEach((x) => { if (!(x.m > 0) || x.pt !== x.fgm * 2 + x.tpm + x.ftm || x.fgm > x.fga || x.tpm > x.tpa) fail('bad mm game'); });
  if (rec.gp !== reg.filter((x) => !x.dnp).length) { R.gpDiff++; fail('gp ' + rec.gp + ' vs ' + reg.filter((x) => !x.dnp).length); }
  if (!Number.isFinite(rec.pts) || (rec.playoff && !Number.isFinite(rec.playoff.pts))) fail('NaN');
  ml.filter((x) => x.k === 'g' && !x.dnp && x.pt == null).forEach(() => fail('game without stats'));
};
for (let i = 0; i < 60; i++) { N.setSeed(4100 + i); const st = G.newCareer({ name: 'i' + i, pos: ['SF', 'PG', 'C', 'PF'][i % 4], arch: ['scorer', 'twoway', 'defender'][i % 3], stars: 3 + (i % 3) }); st.autoPlay = false; G.auto(st, {}); }
console.log(JSON.stringify(R));
if (R.bad || !R.pre || !R.late || !R.mm) { console.log('FAILED'); process.exit(1); } console.log('injury2 OK');
