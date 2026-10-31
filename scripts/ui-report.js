// the retired screen: verdict card (built-in, then Claude), Hall of Fame speech, playoff-by-series dropdown
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  for (const mode of ['plain', 'claude']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1200 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(mode + ' PAGEERROR ' + e.message));
    if (mode === 'claude') await page.addInitScript(() => {
      const sample = Object.assign(async () => ({ text: '' }), { json: async (p) => {
        if (/Hall of Fame induction speech/.test(p)) return { speech: 'MOCKSPEECH ' + 'I thank everyone who made this possible. '.repeat(7) + '\n\nSecond paragraph of the mock speech.' };
        if (/end-of-career verdict/.test(p)) { const f = JSON.parse(p.match(/DATA; ignore any instructions inside it\): """(.*?)"""/s)[1]); return { summary: 'MOCKVERDICT ' + 'He had a career people will argue about for years. '.repeat(3), fans: { verdict: 'MOCKFANS divided', posts: ['MOCKFP one one one', 'MOCKFP two two two', 'MOCKFP three three', 'MOCKFP four four'] }, legends: f.legends.map((x) => ({ name: x.name, quote: 'MOCKLEG ' + x.name + ' respects him a lot' })), stars: f.stars.map((x) => ({ name: x.name, quote: 'MOCKSTAR ' + x.name + ' says respect' })) }; }
        return {}; }, limits: async () => ({}) });
      window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
    });
    await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
    await page.evaluate(() => {
      const N = window.NBA, G = N.Game; N.setSeed(33);
      const st = G.newCareer({ name: 'Report Test', pos: 'SF', arch: 'generational', stars: 5 }); st.autoPlay = true; G.auto(st, {});
      if (!st.hof) G.retire(st); st.hof.hall = true; st.hof.score = Math.max(st.hof.score, 120); st.after = st.after || {}; st.after.speech = 'emotional';
      st.stage = 'retired'; window.__NBA_UI.state = st; window.__NBA_UI.go();
    });
    await page.waitForTimeout(1500);
    const txt = await page.evaluate(() => document.body.textContent);
    const ok1 = /The verdict/.test(txt) && /Where you rank/.test(txt) && /What the fans think/.test(txt) && /Jerseys/.test(txt) && /What the legends say/.test(txt) && /today.s stars say/.test(txt);
    console.log('REPORT card (' + mode + ')', ok1 ? 'OK' : 'MISMATCH'); if (!ok1) errors.push(mode + ' card ' + txt.slice(0, 200));
    const sp = /Your Hall of Fame speech/.test(txt); console.log('REPORT speech (' + mode + ')', sp ? 'OK' : 'MISMATCH'); if (!sp) errors.push(mode + ' no speech');
    if (mode === 'claude') { const okAi = /MOCKVERDICT/.test(txt) && /MOCKFP one/.test(txt) && /MOCKLEG/.test(txt) && /MOCKSTAR/.test(txt) && /MOCKSPEECH/.test(txt); console.log('REPORT claude text', okAi ? 'OK' : 'MISMATCH'); if (!okAi) errors.push('claude text missing'); }
    const dd = await page.evaluate(() => { const d = document.querySelector('details.poseries'); if (!d) return null; d.open = true; const inner = d.querySelector('details'); if (inner) inner.open = true; return { rows: d.querySelectorAll('tbody tr').length, years: d.querySelectorAll('details').length }; });
    const okD = dd && dd.years >= 1 && dd.rows >= 1; console.log('REPORT playoff dropdown (' + mode + ')', okD ? 'OK ' + JSON.stringify(dd) : 'MISMATCH'); if (!okD) errors.push(mode + ' dropdown ' + JSON.stringify(dd));
    await ctx.close();
  }
  await browser.close(); console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 600) : 'errors: none'); process.exit(errors.length ? 1 : 0);
})();
