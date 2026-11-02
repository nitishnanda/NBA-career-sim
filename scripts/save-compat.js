// Old saves in the new build. For each older version (built from git into /tmp/oldv/<name>, see below) this makes saves at several points of a career
// (mid-season, a playoff game, the offseason decision, training, preseason), then loads each in the CURRENT dist, plays on (games, the season, the summer, a new season)
// and fails on any page error or stuck screen.
//   setup:  for v in v85:548f1ff v95:aaf4cbd v101:4c6626e v105:e859c03 v109:e3d057d; do n=${v%%:*}; c=${v##*:}; git worktree add -f /tmp/oldv/$n $c --detach -q; (cd /tmp/oldv/$n && python3 scripts/build.py); done
//   run:    node scripts/save-compat.js [v85 v95 ...]
const path = require('path'), fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const KEY = 'nba-career-sim-save-v1', SNAPKEY = 'nba-career-sim-snap-v1';
const versions = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('/tmp/oldv').filter((x) => fs.existsSync('/tmp/oldv/' + x + '/dist/index.html'));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const fails = []; let total = 0;
  { const pg = await (await browser.newContext()).newPage(); await pg.goto('file://' + path.resolve(__dirname, '../dist/index.html')); await pg.evaluate(() => { const d = document.createElement('div'); d.textContent = 'Points: NaN'; document.body.append(d); });
    const hit = await pg.evaluate(() => /undefined|NaN|\[object|null%|Infinity/.test(document.body.innerText)); if (!hit) { console.log('scanner self-test FAILED'); process.exit(2); } console.log('scanner self-test ok (it catches a planted NaN)'); await pg.context().close(); }
  for (const ver of versions) {
    // 1. make the saves with the old build
    const old = await (await browser.newContext({ viewport: { width: 1100, height: 1400 } })).newPage(); const oerr = []; old.on('pageerror', (e) => oerr.push(e.message));
    await old.goto('file:///tmp/oldv/' + ver + '/dist/index.html');
    const saves = await old.evaluate(() => {
      const N = window.NBA, G = N.Game, out = {}, put = (k, st) => { out[k] = JSON.stringify(st); };
      try {
        N.setSeed(9100); const st = G.newCareer({ name: 'Compat Test', pos: 'SF', arch: 'twoway', stars: 4 });
        try { G.auto(st, { onDecision: (s) => { if (s.proSeasons.length >= 3) throw 'stop'; } }); } catch (e) { if (e !== 'stop') throw e; }
        st.autoPlay = false; st.autoDecide = false; st.dec && (st.dec.pending = null);
        put('offseason', Object.assign({}, st, { stage: 'decision', decision: null, matchIdx: (st.matchLog || []).length }));
        const d = G.decisionOptions(st); try { if (d.expiring) { const o = d.resign || (d.offers || [])[0]; G.decide(st, d.resign ? 'resign' : 'switch', { teamId: o.teamId, salary: o.salary, years: 2 }); } else G.decide(st, 'stay'); } catch (e) { /* keep going */ }
        if (st.stage === 'training') put('training', st);
        try { G.train(st, G.autoAlloc(st.player, G.trainingInfo(st).points)); } catch (e) { /* ignore */ }
        if (st.dec) st.dec.pending = null; if (st.stage === 'camp' || st.stage === 'agent' || st.stage === 'promise') st.stage = 'pro_ready';
        if (st.stage === 'pro_ready') put('preseason', st);
        G.playSeason(st); st.dec && (st.dec.pending = null); st.stage = 'season_play'; const snapOld = G.getSnap ? G.getSnap() : null;
        st.matchIdx = Math.min(30, (st.matchLog || []).length); put('midseason', st); out.snap = snapOld || '';
        const po = (st.matchLog || []).findIndex((x) => x.k === 'g' && x.po); if (po > 0) { st.matchIdx = po + 1; put('playoffs', st); }
        st.matchIdx = (st.matchLog || []).length; st.stage = 'season_recap'; put('recap', st);
      } catch (e) { out.error = String(e && e.stack || e); }
      return out;
    });
    await old.context().close();
    if (saves.error) { console.log(ver, 'could not make saves:', saves.error.slice(0, 200)); fails.push(ver + ' setup'); continue; }
    // 2. load each in the current build and play on
    for (const k of Object.keys(saves).filter((x) => x !== 'snap')) {
      total++; const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } }); const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(([key, val, skey, sval]) => { try { localStorage.setItem(key, val); if (sval) localStorage.setItem(skey, sval); } catch (e) { /* ignore */ } }, [KEY, saves[k], SNAPKEY, k === 'midseason' || k === 'playoffs' ? saves.snap : '']);
      await page.goto('file://' + path.resolve(__dirname, '../dist/index.html')); await page.waitForTimeout(500);
      const resume = await page.$('button:text-matches("^Continue$")'); if (resume) { await resume.click(); await page.waitForTimeout(400); }
      let stage0 = await page.evaluate(() => window.__NBA_UI.state && window.__NBA_UI.state.stage); let steps = 0, last = stage0, stuck = 0; const bad = [];
      const scan = async (where) => { const t = await page.evaluate(() => document.body.innerText); const m = t.match(/undefined|NaN|\[object|null%|Infinity/); if (m) bad.push(where + ': "' + m[0] + '" near "' + t.slice(Math.max(0, t.indexOf(m[0]) - 40), t.indexOf(m[0]) + 30).replace(/\n/g, ' ') + '"'); };
      // every top-level page of the old save (they read the most fields)
      await scan('first screen');
      for (const v of ['Team', 'Around the league', 'Career', 'Season']) { await page.evaluate((name) => { const b = Array.from(document.querySelectorAll('nav button, header button, button')).find((x) => x.textContent.trim().toLowerCase().startsWith(name.toLowerCase())); if (b) b.click(); }, v); await page.waitForTimeout(250); await scan(v); }
      // drive: whatever primary button is on screen, a few dozen times (sim games, finish seasons, decisions), watching for errors and for a stuck screen
      for (let i = 0; i < 70 && !errs.length; i++) {
        if (i % 12 === 5) await scan('play step ' + i);
        const before = await page.evaluate(() => { const s = window.__NBA_UI.state; return s ? s.stage + '|' + (s.matchIdx || 0) + '|' + (s.league ? s.league.year : '') : ''; });
        const acted = await page.evaluate(() => {
          const vis = (b) => b.offsetParent !== null && !b.disabled;
          const q = (re, root) => Array.from((root || document).querySelectorAll('button')).find((b) => vis(b) && re.test(b.textContent));
          const dlg = document.querySelector('.dlg-back');
          if (dlg) { const b = q(/Back to the season|Play the game|Continue|Go with this|Choose|Do it|Sign|Stay|Skip|Not now|Decline|No comment|Quiet|Keep|Accept|Rest/i, dlg) || dlg.querySelector('.wkcard button'); if (b) { b.click(); return 'dlg'; } }
          const b = q(/^(Tip off|Sim to playoffs|Sim next|Sim next playoff|Season recap|Continue|Confirm|Play the|Start|Auto-allocate|Stay|Re-?sign|Skip to recap|Next)/i);
          if (b) { b.click(); return b.textContent.slice(0, 20); } return null; });
        steps++; await page.waitForTimeout(120);
        const after = await page.evaluate(() => { const s = window.__NBA_UI.state; return s ? s.stage + '|' + (s.matchIdx || 0) + '|' + (s.league ? s.league.year : '') : ''; });
        if (after === before && !acted) { if (++stuck > 3) break; } else stuck = 0;
      }
      const end = await page.evaluate(() => { const s = window.__NBA_UI.state; return s ? { stage: s.stage, idx: s.matchIdx, year: s.league && s.league.year, seasons: s.proSeasons && s.proSeasons.length } : null; });
      const loaded = !!stage0; const ok = loaded && !errs.length && !bad.length; if (bad.length) errs.push(bad[0]);
      console.log((ok ? 'OK  ' : 'FAIL') + ' ' + ver + ' ' + k.padEnd(10), 'loaded as', stage0, '→', JSON.stringify(end), errs.length ? 'ERR: ' + errs[0].slice(0, 160) : '');
      if (!ok) fails.push(ver + ':' + k + ' ' + (errs[0] || 'did not load').slice(0, 120));
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fails.length ? '\n' + fails.length + ' of ' + total + ' old saves failed:\n  ' + fails.join('\n  ') : '\nall ' + total + ' old saves load and play on');
  process.exit(fails.length ? 1 : 0);
})();
