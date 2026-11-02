// Phone layout (390x844): no screen scrolls sideways and nothing sticks out past the right edge. Reports the offending elements.
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const W = +process.env.PHONE_W || 390;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), page = await ctx.newPage(); const errors = [], report = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  const audit = async (name) => {
    await page.waitForTimeout(250);
    const r = await page.evaluate((vw) => {
      const de = document.documentElement, off = []; const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
      // an element counts when it sticks out past the right edge and no ancestor scrolls it horizontally on purpose
      const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
      document.querySelectorAll('body *').forEach((e) => { if (!vis(e)) return; const b = e.getBoundingClientRect(); if (b.right > vw + 1 && !clipped(e)) off.push({ tag: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), right: Math.round(b.right), w: Math.round(b.width), text: (e.textContent || '').trim().slice(0, 40) }); });
      // keep the outermost offenders only
      const top = off.filter((o, i) => !off.some((p, j) => j !== i && p.right >= o.right && p.w > o.w && false)).slice(0, 8);
      return { sw: de.scrollWidth, vw, off: top, n: off.length };
    }, W);
    const bad = r.sw > W + 1 || r.n > 0; report.push({ name, bad, r });
    console.log((bad ? 'WIDE ' : 'ok   ') + name.padEnd(34), 'scrollWidth ' + r.sw + '/' + W, r.n ? r.n + ' elements past the edge, e.g. ' + r.off.slice(0, 3).map((o) => o.tag + ' (' + o.text + ') right=' + o.right).join(' | ') : '');
  };
  const setup = (fn) => page.evaluate(fn);
  // the create screen and a career at every stage that matters
  await audit('create screen');
  await setup(() => { const N = window.NBA, G = N.Game; N.setSeed(4410); const st = G.newCareer({ name: 'Phone Test', pos: 'SF', arch: 'generational', stars: 5 }); try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 6) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; } window.__st0 = JSON.stringify(st); });
  const use = (fn) => page.evaluate((src) => { const st = JSON.parse(window.__st0); st.autoPlay = false; st.autoDecide = false; st.noSocial = true; st.dec.pending = null; st.decResult = null; (new Function('st', src))(st); window.__NBA_UI.state = st; window.__NBA_UI.go(); }, fn.toString().replace(/^[^{]*\{/, '').replace(/\}$/, ''));
  const click = (name) => page.evaluate((n) => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim().toLowerCase().startsWith(n)); if (b) b.click(); }, name);
  await use(() => { st.stage = 'decision'; st.decision = null; st.matchIdx = st.matchLog.length; st.dec.flags.coachYear = st.league.year; }); await audit('offseason: team moves tab');
  await click('2 ·'); await audit('offseason: league & teammates tab'); await click('3 ·'); await audit('offseason: life & money tab');
  await use(() => { st.stage = 'training'; st.afterTraining = 'pro'; }); await audit('training');
  await use(() => { st.stage = 'pro_ready'; }); await audit('preseason');
  await use(() => { st.stage = 'season_play'; st.matchIdx = 20; window.__NBA_UI.silence(st); }); await audit('season page (mid-season)');
  await page.evaluate(() => { const d = document.querySelector('details.wbox'); if (d) d.open = true; }); await audit('season page: full box open');
  await use(() => { const i = st.matchLog.findIndex((x) => x.k === 'g' && x.po && !x.pi); st.matchIdx = i + 3; st.dlDone = true; st.poPlans = { 0: 'balanced', 1: 'balanced', 2: 'balanced', 3: 'balanced' }; st.poPress = { 0: null, 1: null, 2: null, 3: null }; window.__NBA_UI.silence(st); }); await audit('season page (playoffs)');
  await use(() => { st.matchIdx = st.matchLog.findIndex((x) => x.k === 'hdr' && /^Regular season complete/.test(x.text)); window.__NBA_UI.silence(st, null, ['bk']); }); await audit('postseason bracket screen');
  await use(() => { st.matchIdx = st.matchLog.length; st.stage = 'season_play'; st.matchLog.forEach((x) => { x.bk = 1; }); }); await audit('season complete (finals card)');
  await use(() => { st.stage = 'season_recap'; st.matchIdx = st.matchLog.length; }); await audit('season recap');
  await click('team'); await audit('team page'); await click('around the league'); await audit('around the league'); await click('career'); await audit('career page');
  await use(() => { st.stage = 'season_play'; st.matchIdx = 20; window.__NBA_UI.silence(st); st.matchLog[20].pc = 1; delete st.matchLog[20].pd; st.dec.pending = null; });
  await page.evaluate(() => { const st = window.__NBA_UI.state; st.dec.flags.pr = st.dec.flags.pr || { quotes: [], tally: [], feuds: {}, heads: [], rep: {} }; window.NBA.Decisions.offer(st, 'press'); window.__NBA_UI.go(); }); await audit('press conference pop-up');
  await use(() => { const i = st.matchLog.findIndex((x) => x.k === 'g' && x.po && !x.pi); st.matchIdx = i; st.dlDone = true; st.poPlans = { 0: 'balanced' }; window.__NBA_UI.silence(st); st.dec.pending = null; });
  await page.evaluate(() => { const st = window.__NBA_UI.state; const m = window.NBA.Core.momentOf(st, st.matchIdx); window.NBA.Decisions.offer(st, 'seriesmoment'); window.__NBA_UI.go(); }); await audit('series moment pop-up');
  await browser.close();
  const bad = report.filter((x) => x.bad); console.log('\n' + (bad.length ? bad.length + ' of ' + report.length + ' phone screens are too wide' : 'all ' + report.length + ' phone screens fit'));
  console.log(errors.length ? 'errors: ' + JSON.stringify(errors).slice(0, 500) : 'errors: none'); process.exit(bad.length || errors.length ? 1 : 0);
})();
