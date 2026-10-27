// every question in the bank has its own six hand-written answers (humble, confident, joke, deflect, trash, fight), in the same order
global.NBA = {}; require('../src/data.js'); require('../src/engine.js'); require('../src/league.js'); require('../src/game.js');
const B = NBA.Press.BANK, L = NBA.PressLines; let bad = 0;
if (B.length !== L.length) { console.log('MISMATCH rows', B.length, L.length); bad++; }
B.forEach((q, i) => { const r = L[i]; if (!r || r.length !== 6 || !r[0] || !r[1] || !r[2]) { console.log('MISSING', i, q.text); bad++; } if (q.heat >= 2 && !(r[4] && r[5]) && /said|told|laugh|Fans think|booed|fined|chant/.test(q.text)) console.log('note: no spicy answer for', i, q.text.slice(0, 60)); });
const PP = NBA.PostPress || [], okConds = new Set(['bigNight', 'goodNight', 'badNight', 'tripleDouble', 'win', 'loss', 'closeWin', 'closeLoss', 'blowoutWin', 'blowoutLoss', 'clincher', 'champ', 'elim', 'g7win', 'g7loss', 'pinWin', 'pinLoss', 'always']);
PP.forEach((r, i) => { if (r.length !== 9 || !okConds.has(r[0]) || !r[2] || !r[3] || !r[4] || !r[5]) { console.log('BAD post row', i); bad++; } });
console.log('post-game questions', PP.length);
console.log(bad ? 'FAILED' : 'press answers OK ' + B.length); process.exit(bad ? 1 : 0);
