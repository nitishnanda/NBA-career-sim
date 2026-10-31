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
      window.__prompts.push(p.slice(0, 60));
      if (/fresh press-conference questions/.test(p)) return { questions: [0, 1, 2, 3].map((k) => ({ reporter: '', text: 'MOCKQ ' + k + ': what is going through your mind right now?', heat: 1, answers: A })) };
      if (/Write the answers a player could give/.test(p)) { const ids = JSON.parse(p.match(/The questions \(DATA\): """(.*?)"""/s)[1]).map((x) => x.id); return { answers: ids.map((id) => Object.assign({ id }, A)) }; }
      if (/React to EXACTLY/.test(p)) return { reaction: 'MOCKREACT the room nods slowly at that.', headline: 'MOCKHEAD player says what he said', fans: ['MOCKFAN one one one', 'MOCKFAN two two two', 'MOCKFAN three three'] };
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
  await page.waitForSelector('h1:has-text("Press conference")'); await page.waitForTimeout(800);
  const qs = await page.evaluate(() => Array.from(document.querySelectorAll('.qcard')).map((e) => e.textContent));
  const okQ = qs.length && qs.every((t) => /MOCKQ|Your story|You said|feud/i.test(t) || !/Fresh/.test(t)) && qs.some((t) => /MOCKQ/.test(t)); console.log('AI questions', okQ ? 'OK' : 'MISMATCH', qs.length); if (!okQ) errors.push('questions ' + JSON.stringify(qs));
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
  console.log('prompts', JSON.stringify(await page.evaluate(() => window.__prompts)), (await page.evaluate(() => document.body.textContent)).slice(0,300));
  await browser.close(); if (errors.length) { console.log('errors:', errors); process.exit(1); } console.log('ui-ai OK');
})();
