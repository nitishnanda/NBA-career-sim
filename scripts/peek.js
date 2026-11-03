require('../src/data.js'); const N = require('../src/engine.js'); N.setSeed(+process.argv[2] || 1);
const ceil = +process.argv[3] || 93;
for (const [arch, pos] of [['generational','SF'],['scorer','SF'],['twoway','SF'],['defender','C'],['shooter','PG'],['dominator','C'],['dominator','PG']]) {
  const p = N.makePlayer({ id: 1, pos, arch, ceiling: ceil, age: 18, gap: 0 });
  const e = N.expLine(p, {});
  console.log(arch, pos, 'ovr', N.ovr(p).toFixed(1), Object.entries(p.attrs).map(([k, v]) => k + ':' + Math.round(v)).join(' '));
  console.log('   ', ['pts','reb','ast','stl','blk','usg','ts','mins'].map(k => k + ' ' + (+e[k]).toFixed(2)).join(' | '));
}
