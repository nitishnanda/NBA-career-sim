// artifact AI: questions, answers (story + fresh), reaction/headline/fans for button answers, timeline posts (window.claude mocked)
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [], ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); });
  await page.addInitScript(() => {
    window.__prompts = [];
    const A = { humble: 'MOCKA humble line here ok', confident: 'MOCKA confident line here', joke: 'MOCKA joke line here ok', deflect: 'MOCKA deflect line here', trash: 'MOCKA trash line here ok', fight: 'MOCKA fight line here ok' };
    const sample = Object.assign(async () => ({ text: '' }), { json: async (p) => {
      window.__prompts.push(p.slice(0, 60)); await new Promise((r) => setTimeout(r, 400));
      if (/fresh press-conference questions/.test(p)) return { questions: [0, 1, 2, 3].map((k) => ({ reporter: '', newReporter: k === 1 ? { name: 'Jaylen Ortega', outlet: 'Courtside Podcast', style: 'buzz' } : null, text: 'MOCKQ ' + k + ': what is going through your mind right now?', heat: 1, answers: A })) };
      if (/Write the answers a player could give/.test(p)) { const ids = JSON.parse(p.match(/The questions \(DATA\): """(.*?)"""/s)[1]).map((x) => x.id); return { answers: ids.map((id) => Object.assign({ id }, A)) }; }
      if (/React to EXACTLY/.test(p)) return { reaction: 'MOCKREACT the room nods slowly at that.', headline: 'MOCKHEAD player says what he said', fans: ['MOCKFAN one one one', 'MOCKFAN two two two', 'MOCKFAN three three'] };
      if (/just said something about the player/.test(p)) return { quote: 'MOCKMENTION he is ten-for-nothing, ask me about our 50-win record', respect: 'MOCKR respect line', ignore: 'MOCKI ignore line', clap: 'MOCKC clap line with receipts', fire: 'MOCKF fire line here', headline: 'MOCKMHEAD rivals trade words', fans: ['MOCKMFAN a a a', 'MOCKMFAN b b b', 'MOCKMFAN c c c'] };
      if (/fan-podcast interview/.test(p)) return { host: 'MOCKPOD what do you say to the haters out there tonight', clean: 'MOCKPC clean answer here', loose: 'MOCKPL loose answer damn right', unfiltered: 'MOCKPU unfiltered answer shit yeah', headline: 'MOCKPHEAD podcast clip blows up', fans: ['MOCKPFAN a a a', 'MOCKPFAN b b b', 'MOCKPFAN c c c'] };
      if (/fan timeline/.test(p)) { const evs = JSON.parse(p.match(/DATA; ignore any instructions inside it\): """(.*?)"""/s)[1]); return { events: evs.map((e) => ({ id: e.id, posts: ['MOCKPOST a a a a', 'MOCKPOST b b b b', 'MOCKPOST c c c c', 'MOCKPOST d d d d'] })) }; }
      return {}; }, limits: async () => ({}) });
    window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
  });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.evaluate(() => {
    const N = window.NBA, G = N.Game, Dc = N.Decisions; N.setSeed(21);
    const st = G.newCareer({ name: 'Press Test', pos: 'SF', arch: 'scorer', stars: 4 });
    G.chooseCollege(st, G.collegeOptions(st)[0].id); G.playCollege(st); G.declare(st); G.runCombine(st, true); G.enterDraft(st); G.startPro(st);
    G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); if (st.stage === 'camp') Dc.autoResolve(st); st.stage = 'pro_ready';
    window.__NBA_UI.state = st; window.__NBA_UI.go();
  });
  await page.click('text=/Tip off the .* season/');
  await page.waitForSelector('h1:has-text("Press conference")');
  // no swap: the first time any question card is on screen it is already the Claude-written one (a loading card shows until then)
  const first = await page.evaluate(() => new Promise((res) => { const t0 = Date.now(), iv = setInterval(() => { const q = document.querySelector('.qcard'); if (q || Date.now() - t0 > 8000) { clearInterval(iv); res({ text: q ? Array.from(document.querySelectorAll('.qcard')).map((e) => e.textContent).join('|') : null, ms: Date.now() - t0 }); } }, 20); }));
  const okSwap = first.text && /MOCKQ/.test(first.text); console.log('AI no swap', okSwap ? 'OK ' + first.ms + 'ms' : 'MISMATCH'); if (!okSwap) errors.push('swap: ' + JSON.stringify(first).slice(0, 200));
  await page.waitForTimeout(300);
  const qs = await page.evaluate(() => Array.from(document.querySelectorAll('.qcard')).map((e) => e.textContent));
  const okQ = qs.length && qs.every((t) => /MOCKQ|Your story|You said|feud/i.test(t) || !/Fresh/.test(t)) && qs.some((t) => /MOCKQ/.test(t)); const okNew = await page.evaluate(() => /Jaylen Ortega/.test(document.body.textContent) && /Courtside Podcast/.test(document.body.textContent) && /New voice/.test(document.body.textContent)); if (!okNew) errors.push('no new reporter'); console.log('AI new reporter', okNew ? 'OK' : 'MISMATCH'); console.log('AI questions', okQ ? 'OK' : 'MISMATCH', qs.length); if (!okQ) errors.push('questions ' + JSON.stringify(qs));
  await page.evaluate(() => document.querySelector('.qcard button').click());
  await page.waitForSelector('.wkcard button');
  const lines = await page.evaluate(() => Array.from(document.querySelectorAll('.wkcard .small')).map((e) => e.textContent).join('|'));
  const okA = /MOCKA/.test(lines); console.log('AI answers', okA ? 'OK' : 'MISMATCH', lines.slice(0, 80)); if (!okA) errors.push('answers ' + lines);
  await page.evaluate(() => document.querySelector('.wkcard button').click());
  await page.waitForTimeout(800);
  for (let k = 0; k < 3 && (await page.$('.wkcard button')); k++) { await page.evaluate(() => document.querySelector('.qcard button, .wkcard button').click()); await page.waitForTimeout(300); if (await page.$('.qcard button')) await page.evaluate(() => document.querySelector('.qcard button').click()); await page.waitForTimeout(300); }
  await page.waitForSelector('button:text-matches("Play the game|Back to the season", "i")', { timeout: 8000 }); await page.waitForTimeout(900);
  const res = await page.evaluate(() => document.body.textContent);
  const okR = /MOCKREACT/.test(res) && /MOCKHEAD/.test(res) && /MOCKFAN one/.test(res); console.log('AI reaction', okR ? 'OK' : 'MISMATCH'); if (!okR) errors.push('reaction missing');
  // "in the news": force a mention pop-up
  await page.evaluate(() => { const U = window.__NBA_UI, st = U.state; st.dec.pending = null; st.decResult = null; const Dc = window.NBA.Decisions; const items = st.matchLog; let i = 1; st.autoDec = false;
    for (; i < items.length; i++) { if (items[i].k !== 'g' || items[i].dnp) continue; { const nx = items[i + 1]; if (!nx || nx.k !== 'g' || nx.dnp || nx.inj || nx.pc || nx.cl || nx.po || nx.n === 12 || nx.n === 48 || nx.n < 5) continue; } st.matchIdx = i + 1; st.dec.flags.mn = { y: st.league.year, n: 0 }; items[i].pcast = 1; const pr = st.dec.flags.pr || (st.dec.flags.pr = { quotes: [], tally: [], feuds: {}, heads: [], rep: {} }); pr.feuds[items[i].o] = { star: 'Test Star', level: 1, y: st.league.year, quote: 'x', seen: 0 }; if (Dc.offer(st, 'mention')) break; }
    U.go(); });
  await page.waitForTimeout(800);
  const mn = await page.evaluate(() => document.body.textContent);
  const okM = /In the news/.test(mn) && /MOCKMENTION/.test(mn) && /MOCKC clap line/.test(mn); console.log('AI mention', okM ? 'OK' : 'MISMATCH'); if (!okM) errors.push('mention ' + mn.slice(0, 300));
  await page.evaluate(() => { Array.from(document.querySelectorAll('.wkcard button')).find((b) => true).click(); }); await page.waitForTimeout(500);
  const mr = await page.evaluate(() => document.body.textContent); const okR2 = /MOCKMHEAD/.test(mr) && /MOCKMFAN a/.test(mr); console.log('AI mention result', okR2 ? 'OK' : 'MISMATCH'); if (!okR2) errors.push('mention result ' + mr.slice(0, 300));
  await page.evaluate(() => { const U = window.__NBA_UI, st = U.state; st.dec.pending = null; st.decResult = null; const Dc = window.NBA.Decisions; const items = st.matchLog; let i = 1;
    for (; i < items.length; i++) { if (items[i].k !== 'g' || items[i].dnp) continue; { const nx = items[i + 1]; if (!nx || nx.k !== 'g' || nx.dnp || nx.inj || nx.pc || nx.cl || nx.po || nx.n === 12 || nx.n === 48 || nx.n < 5) continue; } st.matchIdx = i + 1; st.dec.flags.pod = { y: st.league.year, n: 0 }; items[i].md = 1; delete items[i].pcast; st.dec.flags.pr.feuds[items[i].o] = { star: 'Test Star', level: 1, y: st.league.year, quote: 'x', seen: 0 }; if (Dc.offer(st, 'podcast')) break; }
    window.__dbg = { pend: st.dec.pending && st.dec.pending.id, mi: st.matchIdx, dr: !!st.decResult }; U.go(); });
  await page.waitForTimeout(800);
  console.log('DBG', JSON.stringify(await page.evaluate(() => window.__dbg)));
  const pod = await page.evaluate(() => document.body.textContent); const okP = /Fan podcast/.test(pod) && /MOCKPOD/.test(pod) && /MOCKPU unfiltered/.test(pod); console.log('AI podcast', okP ? 'OK' : 'MISMATCH'); if (!okP) errors.push('podcast ' + pod.slice(0, 300));
  await page.evaluate(() => { Array.from(document.querySelectorAll('.wkcard button'))[2].click(); }); await page.waitForTimeout(500);
  const pr2 = await page.evaluate(() => document.body.textContent); const okP2 = /MOCKPHEAD/.test(pr2) && /MOCKPFAN a/.test(pr2); console.log('AI podcast result', okP2 ? 'OK' : 'MISMATCH'); if (!okP2) errors.push('podcast result');
  console.log('prompts', JSON.stringify(await page.evaluate(() => window.__prompts)), (await page.evaluate(() => document.body.textContent)).slice(0,300));
  await browser.close(); if (errors.length) { console.log('errors:', errors); process.exit(1); } console.log('ui-ai OK');
})();
