"""Rebuild src/real.js: rate the real 2026-27 rosters from real 2025-26 production.

Inputs : data/real-roster-base.json (names, teams, ages, positions, archetypes, my prior ratings)
         data/perf-ovr.json        (sim talent by rank; node scripts/perf-to-ovr.js)
         data/real-targets.json    (real age curve; python3 scripts/real-targets.py)
         the Basketball-Reference CSVs (sumitrodatta/bball-reference-datasets)
Output : src/real.js

Rating = 65% stats-based + 35% prior. Stats-based = the sim rating held by the player of the same production rank
(real rank N by perf -> sim's Nth best rating), then aged forward one season with the real age curve.
Usage  : python3 scripts/build-real.py [path/to/Data]
"""
import json, os, re, sys, unicodedata
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), '..')
D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
base = json.load(open(os.path.join(ROOT, 'data/real-roster-base.json')))
po = json.load(open(os.path.join(ROOT, 'data/perf-ovr.json')))
rt = json.load(open(os.path.join(ROOT, 'data/real-targets.json')))
OVR_BY_RANK = po['ovrByRank']
AGE_DELTA = {int(k): v for k, v in rt['age_delta_perf'].items()}


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', s)
    return ' '.join(re.sub(r'[^a-z ]', ' ', s).split())


def one(df):
    df = df.copy(); df['_t'] = (df.team == 'TOT').astype(int)
    return df.sort_values('_t', ascending=False).drop_duplicates(['season', 'player_id']).drop(columns='_t')


pg = one(pd.read_csv(D + 'Player Per Game.csv').query("lg == 'NBA' and season >= 2025"))
adv = one(pd.read_csv(D + 'Advanced.csv').query("lg == 'NBA' and season >= 2025"))[['season', 'player_id', 'ts_percent', 'usg_percent', 'x3p_ar', 'ast_percent', 'trb_percent', 'stl_percent', 'blk_percent']]
d = pg.merge(adv, on=['season', 'player_id'])
d['perf'] = (d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game
             + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game)
d['key'] = d.player.map(norm)
q = d[d.g >= 40].copy()
q['rank'] = q.groupby('season').perf.rank(ascending=False, method='first')


def ovr_at_rank(r):
    if r <= len(OVR_BY_RANK):
        return OVR_BY_RANK[int(r) - 1]
    # the sim has no one below its ~116th player, so real ranks beyond that are floored at role-player level
    return max(64.0, OVR_BY_RANK[-1] - 0.12 * (r - len(OVR_BY_RANK)))


def suggest(r):
    """archetype suggested by the real stat profile (used only as a review flag)"""
    pts, reb, ast = r.pts_per_game, r.trb_per_game, r.ast_per_game
    stocks = r.stl_per_game + r.blk_per_game
    if reb >= 6.5 and ast >= 6.0 and pts >= 14: return 'dominator'
    if pts < 16 and (r.blk_per_game >= 1.3 or reb >= 8.5) and r.usg_percent < 21: return 'defender'
    if r.x3p_ar >= 0.5 and r.ts_percent >= 0.57 and r.pts_per_game < 27: return 'shooter'
    if stocks >= 2.0 and pts >= 15: return 'twoway'
    return 'scorer'


rows_out, diag = [], []
for r in base['rows']:
    k = norm(r['name'])
    cand = q[q.key == k].sort_values('season', ascending=False)
    allrows = d[d.key == k].sort_values('season', ascending=False)
    if k == 'egor demin' and not len(allrows):
        allrows = d[d.key.str.contains('demin')].sort_values('season', ascending=False)
        cand = q[q.key.str.contains('demin')].sort_values('season', ascending=False)
    act, final, stat_ovr = None, r['ovr'], None
    if len(cand):
        estimates = []
        for _, s in cand.iterrows():
            seasons_ahead = 2027 - int(s.season)  # to the 2026-27 season
            o = ovr_at_rank(s['rank'])
            for i in range(seasons_ahead):
                o += AGE_DELTA.get(int(s.age) + i, -3.0) / 1.2
            estimates.append((o, 0.65 if int(s.season) == 2026 else 0.35))
        wsum = sum(w for _, w in estimates)
        stat_ovr = sum(o * w for o, w in estimates) / wsum
        final = round(max(58, min(98, 0.65 * stat_ovr + 0.35 * r['ovr'])))
    use = (cand.iloc[0] if len(cand) else (allrows.iloc[0] if len(allrows) else None))
    if use is not None:
        act = [int(use.season), int(use.g), float(use.mp_per_game), float(use.pts_per_game), float(use.trb_per_game), float(use.ast_per_game),
               float(use.stl_per_game), float(use.blk_per_game), float(use.tov_per_game), round(float(use.ts_percent), 3), round(float(use.usg_percent), 1)]
        sug = suggest(use) if int(use.g) >= 30 else None
    else:
        sug = None
    row = [r['name'], r['pos'], r['age'], final, r['arch']] + ([r['sec']] if r['sec'] else [''])
    row.append(act)
    rows_out.append((r['team'], row))
    diag.append((r['name'], r['arch'], sug, r['ovr'], None if stat_ovr is None else round(stat_ovr, 1), final, act))

# --- report
print('%-26s %-12s %-10s %5s %6s %5s   2025-26 line' % ('player', 'my arch', 'stat arch', 'prior', 'stats', 'final'))
changed = 0
for name, arch, sug, prior, so, fin, act in sorted(diag, key=lambda x: -x[5]):
    line = '' if not act else '%d g %.1f mpg %.1f/%.1f/%.1f' % (act[0], act[2], act[3], act[4], act[5]) if False else ('' if not act else '%.1f/%.1f/%.1f in %.0f mpg (%d g, %d)' % (act[3], act[4], act[5], act[2], act[1], act[0]))
    flag = '  <-- arch?' if sug and sug != arch else ''
    print('%-26s %-12s %-10s %5d %6s %5d   %s%s' % (name, arch, sug or '-', prior, '-' if so is None else so, fin, line, flag))

# --- write src/real.js
by_team = {}
for t, row in rows_out:
    by_team.setdefault(t, []).append(row)
def js(v):
    return json.dumps(v, ensure_ascii=False)
out = ["(function (g) {", "  'use strict';",
       "  // Real league snapshot for the start of the 2026-27 season (20 Oct 2026). GENERATED by scripts/build-real.py.",
       "  // Rosters/ages come from preseason reporting; ratings come from each player's real 2025-26 production (65%) and our prior (35%).",
       "  // Row: [name, pos, age, overall, archetype, secondary, lastSeasonLine]  lastSeasonLine = [season, g, mpg, pts, reb, ast, stl, blk, tov, ts, usg%]",
       "  const TEAMS = {"]
for t, rows in by_team.items():
    out.append("    %s: [%s]," % (js(t), ', '.join(js(r) for r in rows)))
out.append("  };")
out.append("")
out.append("  // 2026 draft class: [name, team, pos, age, overall, ceiling, archetype, secondary, pick]")
out.append("  const ROOKIES = [")
for r in base['rookies']:
    out.append("    %s," % js(r))
out.append("  ];")
out.append("")
out.append("  // approximate 2025-26 records, used only so year-one win totals have some continuity")
out.append("  const WINS = %s;" % js(base['wins']))
out.append("")
out.append("  g.NBA.real = { TEAMS, ROOKIES, WINS, asOf: '2026-10-20' };")
out.append("  if (typeof module !== 'undefined') module.exports = g.NBA;")
out.append("})(typeof window !== 'undefined' ? window : globalThis);")
open(os.path.join(ROOT, 'src/real.js'), 'w').write('\n'.join(out) + '\n')
print('\nwrote src/real.js')
