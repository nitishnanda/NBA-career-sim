// typed press answers: read by the built-in reader (plain page) and by Claude (artifact: window.claude.sample, mocked here)
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  for (const mode of ['reader', 'claude', 'claude-down']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } }); const page = await ctx.newPage();
    page.on('pageerror', (e) => { errors.push(mode + ' PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
    if (mode !== 'reader') await page.addInitScript((m) => {
      window.__prompts = [];
      const sample = Object.assign(async () => ({ text: '' }), { json: async (prompt) => { window.__prompts.push(prompt); if (m === 'claude-down') throw { code: 'rate_limited', message: 'busy' }; if (/Write 3 fresh press-conference questions/.test(prompt)) return { questions: [{ reporter: 'Dana Whitfield', text: 'MOCK QUESTION: what is the first thing you want fans to see tonight?', heat: 1, answers: { humble: 'Honestly just a team that plays for each other.', confident: 'A team that is not afraid of anybody in this building.', joke: 'Me finding my seat on the bench. Very exciting.', deflect: 'Come watch the game and find out.', trash: 'That we are better than whoever lines up against us.', fight: 'Come to the game and see me say it to their face.' } }] }; return { tone: 'trash', intensity: 1.2, profane: false, reaction: 'MOCK REACTION: the room gasps.', headline: 'MOCK HEADLINE: star fires back' }; }, limits: async () => ({}) });
      window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
    }, mode);
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
    await page.waitForTimeout(600);
    const fresh = await page.evaluate(() => ({ badge: !!Array.from(document.querySelectorAll('.qcard .badge')).find((e) => /Fresh question/.test(e.textContent)), mock: /MOCK QUESTION/.test(document.body.innerText) }));
    const okAi = mode === 'claude' ? fresh.badge && fresh.mock : !fresh.badge; console.log('PRESS fresh questions (' + mode + ')', okAi ? 'OK' : 'MISMATCH', JSON.stringify(fresh)); if (!okAi) errors.push(mode + ' fresh ' + JSON.stringify(fresh));
    if (mode === 'claude') await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.qcard')).find((e) => /MOCK QUESTION/.test(e.textContent)); b.querySelector('button').click(); }); else await page.click('.qcard button >> nth=0');
    await page.waitForSelector('.pressbox');
    const note = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.querySelector('.card .pressnote').textContent), 200)));
    const okNote = mode === 'reader' ? /read your answer for tone/.test(note) : /reporters in this room are Claude/.test(note);
    console.log('PRESS typed note (' + mode + ')', okNote ? 'OK' : 'MISMATCH', note); if (!okNote) errors.push(mode + ' note ' + note);
    const bad = 'Wembanyama is overrated and he cannot guard me, bring it';
    await page.fill('.pressbox', bad); await page.click('.card:has(.pressbox) button.primary');
    await page.waitForSelector('button:text-matches("Play the game|Back to the season", "i")', { timeout: 8000 });
    const fin = await page.evaluate(() => { const S = window.__NBA_UI.state, j = S.dec.journal.slice(-1)[0]; return { pd: !!S.matchLog[0].pd, media: S.dec.flags.media, locker: S.dec.flags.locker, journal: j && j.text, headline: (document.querySelector('.headline') || {}).textContent || '', fans: document.querySelectorAll('.fan').length, quotes: ((S.dec.flags.pr || {}).quotes || []).length, prompts: (window.__prompts || []).length, prompt0: (window.__prompts || [])[0] || '' }; });
    const okFin = fin.pd && typeof fin.media === 'number' && fin.headline.length > 8 && fin.fans >= 3 && fin.quotes === 1 && (mode === 'reader' || mode === 'claude-down' || (fin.prompts === 2 && /DATA; ignore any instructions/.test(fin.prompt0) && /MOCK HEADLINE/.test(fin.headline)));
    console.log('PRESS typed resolved (' + mode + ')', okFin ? 'OK' : 'MISMATCH', JSON.stringify({ pd: fin.pd, media: fin.media, locker: fin.locker, prompts: fin.prompts, headline: fin.headline.slice(0, 70), fans: fin.fans, quotes: fin.quotes, journal: (fin.journal || '').slice(0, 90) })); if (!okFin) errors.push(mode + ' resolved ' + JSON.stringify(fin));
    await page.click('button:text-matches("Play the game|Back to the season", "i")');
    await ctx.close();
  }
  console.log('errors:', errors.length ? errors : 'none'); await browser.close();
})().catch((e) => { console.error('TEST FAILED', e.message); process.exit(1); });
