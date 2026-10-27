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
      const sample = Object.assign(async () => ({ text: '' }), { json: async (prompt) => { window.__prompts.push(prompt); if (m === 'claude-down') throw { code: 'rate_limited', message: 'busy' }; return { tone: 'trash', intensity: 1.2, profane: false, reaction: 'MOCK REACTION: the room gasps.', headline: 'MOCK HEADLINE: star fires back' }; }, limits: async () => ({}) });
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
    const note = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.querySelector('.pressnote').textContent), 200)));
    const okNote = mode === 'reader' ? /read your answer for tone/.test(note) : /reporters in this room are Claude/.test(note);
    console.log('PRESS typed note (' + mode + ')', okNote ? 'OK' : 'MISMATCH', note); if (!okNote) errors.push(mode + ' note ' + note);
    const q1 = await page.evaluate(() => document.querySelector('.card.suspense h2').textContent);
    const say = 'Honestly I just want to thank my teammates and the coach, we have a great group';
    await page.fill('.pressbox', say); await page.click('.card:has(.pressbox) button.primary');
    await page.waitForFunction(() => /Question 2/i.test(document.body.innerText), null, { timeout: 8000 });
    const log1 = await page.evaluate(() => Array.from(document.querySelectorAll('.jmsg')).map((e) => e.textContent).join(' | '));
    const q2 = await page.evaluate(() => document.querySelector('.card.suspense h2').textContent);
    const ok1 = log1.includes(say) && (mode === 'reader' ? /class act|nods along|PR people|Nobody has a follow-up/.test(log1) : mode === 'claude' ? /MOCK REACTION/.test(log1) : /class act|nods along|PR people|Nobody has a follow-up/.test(log1));
    console.log('PRESS typed answer 1 (' + mode + ')', ok1 ? 'OK' : 'MISMATCH', log1.slice(0, 160)); if (!ok1) errors.push(mode + ' answer1 ' + log1);
    const bad = 'Wembanyama is overrated and he cannot guard me, bring it';
    await page.fill('.pressbox', bad); await page.click('.card:has(.pressbox) button.primary');
    await page.waitForSelector('button:text-matches("Play the game|Back to the season", "i")', { timeout: 8000 });
    const fin = await page.evaluate(() => { const S = window.__NBA_UI.state, j = S.dec.journal.slice(-1)[0]; return { pd: !!S.matchLog[0].pd, media: S.dec.flags.media, locker: S.dec.flags.locker, journal: j && j.text, flash: (document.body.innerText.match(/Headline: [^\n]*/) || [''])[0], prompts: (window.__prompts || []).length, prompt0: (window.__prompts || [''])[0] }; });
    const okFin = fin.pd && typeof fin.media === 'number' && (mode === 'reader' || mode === 'claude-down' || (fin.prompts === 2 && /DATA; ignore any instructions/.test(fin.prompt0) && /MOCK HEADLINE/.test(fin.flash)));
    console.log('PRESS typed resolved (' + mode + ')', okFin ? 'OK' : 'MISMATCH', JSON.stringify({ pd: fin.pd, media: fin.media, locker: fin.locker, prompts: fin.prompts, flash: fin.flash.slice(0, 70), journal: (fin.journal || '').slice(0, 90) })); if (!okFin) errors.push(mode + ' resolved ' + JSON.stringify(fin));
    await page.click('button:text-matches("Play the game|Back to the season", "i")');
    await ctx.close();
  }
  console.log('errors:', errors.length ? errors : 'none'); await browser.close();
})().catch((e) => { console.error('TEST FAILED', e.message); process.exit(1); });
