// the career verdict: all-time rank, who beats you where, fans, jerseys, legends/stars, speech fallback, prompts/checkers
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); const N = global.NBA; require('../src/game.js');
const G = N.Game, R = N.Report; let bad = 0, n = 0; const ranks = [];
const t = (c, m) => { if (!c) { bad++; if (bad < 8) console.log('FAIL', m); } };
const top = R.GOATS.slice(0, 5).map((x) => x.name + ' ' + x.score).join(', '); console.log('GOAT list top:', top);
for (let i = 0; i < 12; i++) {
  N.setSeed(7100 + i); const st = G.newCareer({ name: 'r' + i, pos: ['SF', 'PG', 'C', 'SG', 'PF'][i % 5], arch: ['scorer', 'twoway', 'generational', 'defender'][i % 4], stars: 3 + (i % 3) }); st.autoPlay = true; G.auto(st, {});
  if (!st.hof) G.retire(st);
  const rep = R.build(st); n++; ranks.push(rep.cmp.rank);
  t(rep.cmp.rank >= 1 && rep.cmp.rank <= rep.cmp.total, 'rank range'); t(rep.summary.length > 80 && !/undefined|NaN|\{/.test(rep.summary), 'summary: ' + rep.summary);
  t(rep.cmp.above.every((x) => x.score > rep.cmp.score) && rep.cmp.below.every((x) => x.score <= rep.cmp.score), 'above/below'); t(rep.cmp.above.every((x) => x.text.length > 5), 'beats text');
  t(rep.fans.label && rep.fans.hate >= 4 && rep.fans.hate <= 75, 'fans'); t(rep.posts.length >= 2 && rep.posts.every((p) => !/undefined|NaN|\{/.test(p.text)), 'posts');
  t(rep.jerseys.length >= 1 && rep.jerseys.every((j) => j.num >= 1 && j.num <= 99), 'jerseys'); t(rep.legends.length === 3 && rep.legends.every((x) => x.quote && !/\{/.test(x.quote)), 'legends'); t(rep.stars.length >= 1 && rep.stars.every((x) => x.quote && !/\{/.test(x.quote)), 'stars');
  ['humble', 'emotional', 'funny', 'defiant'].forEach((s) => { const sp = R.speechFallback(st, s, rep); t(sp.length > 300 && !/undefined|\{/.test(sp), 'speech ' + s); });
  const facts = R.factsOf(st, rep), p = R.reportPrompt(facts, N.Press.VOICE); t(/DATA/.test(p) && p.length < 9000, 'prompt');
  const ok = R.checkReport({ summary: 'x'.repeat(80), fans: { verdict: 'v', posts: ['aaaa', 'bbbb', 'cccc'] }, legends: rep.legends.map((x) => ({ name: x.name, quote: 'q'.repeat(20) })).concat([{ name: 'Fake Guy', quote: 'q'.repeat(20) }]), stars: rep.stars.map((x) => ({ name: x.name, quote: 'q'.repeat(20) })) }, rep); t(ok && ok.legends.length === 3 && ok.stars.length === rep.stars.length, 'checker drops invented names');
  t(R.checkReport({ summary: 'short' }, rep) === null, 'checker rejects short'); t(R.checkSpeech({ speech: 'x'.repeat(250) }) && !R.checkSpeech({ speech: 'tiny' }), 'speech checker');
  // by-series data exists for the dropdown
  const withSeries = st.proSeasons.filter((r) => r.perSeries && r.perSeries.length); t(withSeries.length >= 1 || st.proSeasons.every((r) => !r.playoff), 'perSeries present');
}
console.log('ranks seen', ranks.join(','), 'of', R.GOATS.length + 1);
console.log(bad ? 'FAILED' : 'report OK'); process.exit(bad ? 1 : 0);
