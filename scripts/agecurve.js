require('../src/data.js'); require('../src/engine.js'); const N = require('../src/league.js'); N.setSeed(3);
const byAge = {};
for (const arch of ['generational','scorer','twoway','defender','shooter','dominator']) {
  for (let i = 0; i < 200; i++) {
    const c = 78 + Math.random() * 16;
    const p = N.makePlayer({ id: 1, pos: N.randomPos(arch), arch, ceiling: c, age: 18 });
    let prev = N.ovr(p);
    while (p.age < 39) {
      N.progress(p);
      const o = N.ovr(p);
      const k = arch + ':' + p.age; (byAge[k] = byAge[k] || []).push(o - prev);
      const k2 = 'all:' + p.age; (byAge[k2] = byAge[k2] || []).push(o - prev);
      prev = o;
    }
  }
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const ages = []; for (let a = 19; a <= 39; a++) ages.push(a);
console.log('age  ' + ages.join('   '));
for (const arch of ['all','generational','scorer','twoway','defender','shooter','dominator']) {
  console.log(arch.padEnd(12), ages.map(a => mean(byAge[arch + ':' + a]).toFixed(1).padStart(4)).join(' '));
}
