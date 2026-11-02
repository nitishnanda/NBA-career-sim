"""Rebuild src/real.js and src/sizes.js: every real NBA rotation player for 2026-27, rated from real impact data and real production.

Inputs (all in the repo unless noted):
  data/sources/darko-dpm-2026-11-02.csv     DARKO daily plus-minus leaderboard (darko.app, 2 Nov 2026): who is on which team now, DPM / O-DPM / D-DPM
  data/sources/lebron-2023-2026.csv         LEBRON (bball-index) 2022-23 .. 2025-26: impact by season, minutes, offensive and defensive roles
  data/sources/darko-proj-*-2026-11-02.csv  DARKO projected 2026-27 wins (first-season team anchor)
  data/sources/wiki-rosters.json            Wikipedia roster templates (python3 scripts/fetch-wiki-rosters.py): birthdays, heights, weights
  data/real-roster-base.json                hand-checked archetypes for the stars (and the 2026 draft class); its ratings are no longer used
  data/perf-ovr.json, data/real-targets.json  the sim's talent-by-rank curve and the real age curve
  Basketball-Reference CSVs (sumitrodatta/bball-reference-datasets, outside the repo): 2023-24 .. 2025-26 box lines

Rating = 55% impact + 45% production, each turned into a rank against last season's 40-game players and then into the sim rating
held by the player of the same rank (scaled to the sim's smaller rotation pool).
  impact     = 0.65 DARKO DPM (current, already age-aware) + 0.35 LEBRON (2025-26 60%, 2024-25 30%, 2023-24 10%), minus a small
               short-minutes term (a +2 in 12 minutes is not a starter)
  production = the box-score production score used across the sim (pts with efficiency, boards, assists, stocks, turnovers),
               2025-26 65% / 2024-25 35%, aged forward with the real age curve
Players with no 40-game season (rookies, long injuries) use impact only.
Each team keeps its ten best (the sim plays ten-man rotations); the 2026 draft class stays in ROOKIES with its own ratings.
Usage: python3 scripts/build-real.py [path/to/bball-reference/Data]
"""
import importlib.util, json, os, re, sys
from datetime import date
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), '..')
P = lambda *a: os.path.join(ROOT, *a)
D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
spec = importlib.util.spec_from_file_location('rr', P('scripts/refresh-rosters.py')); rr = importlib.util.module_from_spec(spec); spec.loader.exec_module(rr)
norm, TEAMS = rr.norm, rr.TEAMS
FULL2NICK = {v: k for k, v in TEAMS.items()}
START = date(2026, 10, 20)
PER_TEAM = 10

base = json.load(open(P('data/real-roster-base.json')))
po = json.load(open(P('data/perf-ovr.json')))
rt = json.load(open(P('data/real-targets.json')))
AGE_DELTA = {int(k): v for k, v in rt['age_delta_perf'].items()}
wiki = json.load(open(P('data/sources/wiki-rosters.json')))['teams']

# the sim's talent by rank: its Nth best 40-game player. The tail of the file thins out (few sim players reach 40 games that deep), so it is cut
# where it stops being smooth and extended gently below that.
OBR = [v for v in po['ovrByRank']]
N_SIM = next(i for i, v in enumerate(OBR) if i > 50 and (v < 60 or OBR[i - 1] - v > 1.5))
OBR = OBR[:N_SIM]


def ovr_at(sim_rank):
    if sim_rank <= N_SIM: return OBR[max(0, int(round(sim_rank)) - 1)]
    return max(52.0, OBR[-1] - 0.09 * (sim_rank - N_SIM))


# ---------------------------------------------------------------- Basketball-Reference box lines
def one(df):
    df = df.copy(); df['_t'] = (df.team == 'TOT').astype(int)
    return df.sort_values('_t', ascending=False).drop_duplicates(['season', 'player_id']).drop(columns='_t')


pg = one(pd.read_csv(D + 'Player Per Game.csv').query("lg == 'NBA' and season >= 2023"))
adv = one(pd.read_csv(D + 'Advanced.csv').query("lg == 'NBA' and season >= 2023"))[['season', 'player_id', 'ts_percent', 'usg_percent', 'x3p_ar']]
bb = pg.merge(adv, on=['season', 'player_id'])
bb['perf'] = (bb.pts_per_game * (1 + 2.2 * (bb.ts_percent.fillna(0.55) - 0.57)) + 1.15 * bb.trb_per_game + 1.5 * bb.ast_per_game
              + 2 * (bb.stl_per_game + bb.blk_per_game) - 1.1 * bb.tov_per_game)
bb['key'] = bb.player.map(norm)
q = bb[bb.g >= 40].copy()
q['rank'] = q.groupby('season').perf.rank(ascending=False, method='first')
q['n'] = q.groupby('season').perf.transform('size')
pool26 = q[q.season == 2026]
seasons_pro = bb.groupby('key').season.nunique()

# ---------------------------------------------------------------- impact data
dk = pd.read_csv(P('data/sources/darko-dpm-2026-11-02.csv'))
num = lambda s: pd.to_numeric(s.astype(str).str.replace('+', '', regex=False).str.replace('%', '', regex=False), errors='coerce')
for c in ['DPM', 'ODPM', 'DDPM', 'MPG']: dk[c] = num(dk[c])
dk['key'] = dk.Player.map(norm)
LB_F = P('data/sources/lebron-2023-2026.csv')   # not in git (a paid export): without it the impact half is DARKO only and ratings shift a little
if os.path.exists(LB_F): lb = pd.read_csv(LB_F)
else: print('WARNING: %s missing, rating impact from DARKO alone' % LB_F); lb = pd.DataFrame(columns=['nba_id', 'Season', 'MPG', 'LEBRON', 'OffRole', 'DefRole', 'Pos'])
LW = {2026: 0.6, 2025: 0.3, 2024: 0.1}


def lebron_of(nid):
    r = lb[lb.nba_id == nid]
    if not len(r): return None, None, None, None, None
    num_, den = 0.0, 0.0
    for _, s in r.iterrows():
        w = LW.get(int(s.Season), 0) * min(1.0, s.MPG / 20.0)        # short-minute seasons count less
        num_ += w * s.LEBRON; den += w
    last = r.sort_values('Season').iloc[-1]
    m26 = r[r.Season == 2026].MPG
    return (num_ / den if den > 0.05 else None), last.OffRole, last.DefRole, (float(m26.iloc[0]) if len(m26) else None), last.Pos


# ---------------------------------------------------------------- who is on which roster: DARKO's team list, birthdays/sizes from Wikipedia
wk = {}
for nick, ps in wiki.items():
    for p in ps: wk.setdefault(norm(p['name']), []).append((nick, p))


def wiki_of(key, nick):
    hit = wk.get(key)
    if not hit: return None
    for t, p in hit:
        if t == nick: return p
    return hit[0][1]


# the same person spelled differently by DARKO, Basketball-Reference and Wikipedia
BB_ALIAS = {'nah shon hyland': 'bones hyland', 'egor demin': norm('Egor Dёmin'), 'david jones': 'david jones garcia'}
WK_ALIAS = {'jakob poeltl': 'jakob poltl', 'yang hansen': 'hansen yang', 'david jones': 'david jones garcia'}
rook_keys = {norm(r[0]) for r in base['rookies']}
cur = {norm(r['name']): r for r in base['rows']}


def age_on(dob):
    y, m, d = map(int, dob.split('-'))
    return START.year - y - ((START.month, START.day) < (m, d))


POSMAP = {'G': 'SG', 'G-F': 'SG', 'F-G': 'SF', 'F': 'SF', 'F-C': 'PF', 'C-F': 'C', 'C': 'C'}


def suggest(r, off, de):
    """archetype from the real stat profile and LEBRON's roles"""
    pts, reb, ast = r.pts_per_game, r.trb_per_game, r.ast_per_game
    stocks = r.stl_per_game + r.blk_per_game; usg = r.usg_percent if r.usg_percent == r.usg_percent else 18; tpar = r.x3p_ar if r.x3p_ar == r.x3p_ar else 0.3
    ts = r.ts_percent if r.ts_percent == r.ts_percent else 0.55
    if reb >= 6.5 and ast >= 6.0 and pts >= 14: return 'dominator'
    if pts < 16 and (r.blk_per_game >= 1.3 or reb >= 8.5 or de == 'Anchor Big') and usg < 21: return 'defender'
    if pts < 12 and de in ('Wing Stopper', 'Point of Attack') and stocks >= 1.3: return 'defender'
    if (tpar >= 0.5 and ts >= 0.57 and pts < 27) or (pts < 12 and off in ('Movement Shooter', 'Stationary Shooter', 'Off Screen Shooter', 'Stretch Big') and tpar >= 0.45): return 'shooter'
    if stocks >= 2.0 and pts >= 15: return 'twoway'
    if pts < 10 and stocks >= 1.6: return 'twoway'
    return 'scorer'


players, miss_bb, miss_wiki = [], [], []
for _, r in dk.iterrows():
    nick = FULL2NICK.get(r.Team)
    if not nick: continue
    k = r.key
    if k in rook_keys: continue                                    # the 2026 draft class keeps its draft-based rating (ROOKIES)
    w = wiki_of(WK_ALIAS.get(k, k), nick)
    rows = bb[bb.key == BB_ALIAS.get(k, k)].sort_values('season', ascending=False)
    if not len(rows):                                              # spelling differs (Nic/Nicolas, Herb/Herbert...): same surname, same last team or a near first name
        last = k.split()[-1]; c = bb[bb.key.str.endswith(' ' + last) & (bb.season >= 2025)]
        c = c[c.key.str[0] == k[0]]
        if c.key.nunique() == 1: rows = bb[bb.key == c.key.iloc[0]].sort_values('season', ascending=False)
    if w is None:
        last = k.split()[-1]; c = [(t, p) for kk, v in wk.items() if kk.endswith(' ' + last) for t, p in v if t == nick]
        if len(c) == 1: w = c[0][1]
    leb, off, de, m26, lpos = lebron_of(int(r['NBA ID']))
    bkey = rows.key.iloc[0] if len(rows) else k
    qa = q[q.key == bkey].sort_values('season', ascending=False)
    qa = qa[qa.season >= 2025]
    # ---- production: rank among last season's 40-game players -> the sim's player of the same share of the pool, aged forward
    prod = None
    if len(qa):
        ests = []
        for _, s in qa.iterrows():
            o = ovr_at(s['rank'] / s['n'] * N_SIM)
            for i in range(2027 - int(s.season)): o += AGE_DELTA.get(int(s.age) + i, -3.0) / 1.2
            ests.append((o, 0.65 if int(s.season) == 2026 else 0.35))
        prod = sum(o * w_ for o, w_ in ests) / sum(w_ for _, w_ in ests)
    # ---- impact
    mpg = max([x for x in [m26, float(rows.iloc[0].mp_per_game) if len(rows) and int(rows.iloc[0].season) == 2026 else None, r.MPG] if x is not None and x == x] or [10])
    imp = r.DPM if leb is None else 0.65 * r.DPM + 0.35 * leb
    imp_adj = imp - 0.07 * max(0.0, 26 - mpg)
    # ---- age, position, size
    if w and w.get('dob'): age = age_on(w['dob'])
    elif k in cur: age = cur[k]['age']
    elif len(rows): age = int(rows.iloc[0].age) + (2027 - int(rows.iloc[0].season))
    else: age = 20
    if not w: miss_wiki.append(r.Player)
    pos = cur[k]['pos'] if k in cur else (lpos if isinstance(lpos, str) and lpos in ('PG', 'SG', 'SF', 'PF', 'C') else
                                          (rows.iloc[0].pos.split('-')[0] if len(rows) else POSMAP.get(r.Pos, 'SF')))
    use = qa.iloc[0] if len(qa) else (rows.iloc[0] if len(rows) else None)
    if use is None: miss_bb.append(r.Player)
    line = None if use is None else [int(use.season), int(use.g), float(use.mp_per_game), float(use.pts_per_game), float(use.trb_per_game), float(use.ast_per_game),
                                     float(use.stl_per_game), float(use.blk_per_game), float(use.tov_per_game),
                                     round(float(use.ts_percent), 3) if use.ts_percent == use.ts_percent else 0.55, round(float(use.usg_percent), 1) if use.usg_percent == use.usg_percent else 15.0]
    if k in cur: arch, sec = cur[k]['arch'], cur[k]['sec']
    elif use is not None and int(use.g) >= 20: arch, sec = suggest(use, off, de), ''
    else: arch, sec = ('defender' if de in ('Anchor Big', 'Wing Stopper') else 'shooter' if isinstance(off, str) and 'Shooter' in off else 'scorer'), ''
    name = cur[k]['name'] if k in cur else r.Player
    ht = w.get('ht') if w else None; wt = w.get('wt') if w else None
    players.append(dict(team=nick, name=name, pos=pos, age=age, prod=prod, imp=imp_adj, dpm=r.DPM, leb=leb, mpg=mpg, arch=arch, sec=sec or '',
                        line=line, ht=ht, wt=wt, yp=int(seasons_pro.get(bkey, 0)), was=cur[k]['ovr'] if k in cur else None, off=off, de=de))

# impact rank against the same pool as production: last season's 40-game players
ref = []
for _, s in pool26.iterrows():
    hit = [p for p in players if norm(p['name']) == s.key]
    if hit: ref.append(hit[0]['imp'])
ref.sort(reverse=True); NREF = len(ref)
for p in players:
    rank = 1 + sum(1 for v in ref if v > p['imp'])
    p['impo'] = ovr_at(rank / NREF * N_SIM)
    p['ovr'] = round(max(50, min(98, p['impo'] if p['prod'] is None else 0.55 * p['impo'] + 0.45 * p['prod'])))

by_team = {}
for p in players: by_team.setdefault(p['team'], []).append(p)
keep = []
for t in TEAMS:
    ps = sorted(by_team.get(t, []), key=lambda p: -p['ovr'])[:PER_TEAM]
    keep += ps; by_team[t] = ps

# ---------------------------------------------------------------- report
print('impact pool %d (40-game players of 2025-26), sim pool %d, darko players %d, kept %d' % (NREF, N_SIM, len(players), len(keep)))
print('no Basketball-Reference line: %d %s' % (len(miss_bb), miss_bb[:20]))
print('no Wikipedia match (age/size fallback): %d %s' % (len(miss_wiki), miss_wiki[:20]))
print('\n%-26s %-5s %3s %-10s %5s %5s %5s %5s %4s   line' % ('player', 'team', 'age', 'arch', 'DPM', 'LEB', 'imp', 'prod', 'ovr'))
for p in sorted(keep, key=lambda p: -p['ovr'])[:60]:
    l = p['line']
    print('%-26s %-5s %3d %-10s %5.1f %5s %5.1f %5s %4d %s  %s' % (p['name'][:26], p['team'][:5], p['age'], p['arch'], p['dpm'], '-' if p['leb'] is None else '%.1f' % p['leb'], p['impo'],
          '-' if p['prod'] is None else '%.1f' % p['prod'], p['ovr'], '' if p['was'] is None else '(was %d)' % p['was'], '' if not l else '%.1f/%.1f/%.1f' % (l[3], l[4], l[5])))

# ---------------------------------------------------------------- DARKO projected wins (first-season anchor)
proj = {}
for f in ('east', 'west'):
    for _, r in pd.read_csv(P('data/sources/darko-proj-%s-2026-11-02.csv' % f)).iterrows(): proj[FULL2NICK[r.Team]] = round(float(r.W), 1)

# ---------------------------------------------------------------- write src/real.js
js = lambda v: json.dumps(v, ensure_ascii=False)
out = ["(function (g) {", "  'use strict';",
       "  // Real league for the 2026-27 season (rosters as of 2 Nov 2026). GENERATED by scripts/build-real.py: do not edit by hand.",
       "  // Every team's ten best players. Ratings: 55% real impact (DARKO DPM + LEBRON) and 45% real box-score production, ranked and put on the sim's scale.",
       "  // Row: [name, pos, age, overall, archetype, secondary, lastSeasonLine, seasonsPro]  lastSeasonLine = [season, g, mpg, pts, reb, ast, stl, blk, tov, ts, usg%]",
       "  const TEAMS = {"]
for t in TEAMS:
    out.append("    %s: [%s]," % (js(t), ', '.join(js([p['name'], p['pos'], p['age'], p['ovr'], p['arch'], p['sec'], p['line'], p['yp']]) for p in by_team[t])))
out += ["  };", "", "  // 2026 draft class: [name, team, pos, age, overall, ceiling, archetype, secondary, pick]", "  const ROOKIES = ["]
out += ["    %s," % js(r) for r in base['rookies']]
out += ["  ];", "", "  // real 2025-26 records (roster continuity) and DARKO's projected 2026-27 wins (2 Nov 2026)",
        "  const WINS = %s;" % js(base['wins']), "  const PROJ = %s;" % js(proj), "",
        "  g.NBA.real = { TEAMS, ROOKIES, WINS, PROJ, asOf: '2026-11-02' };",
        "  if (typeof module !== 'undefined') module.exports = g.NBA;", "})(typeof window !== 'undefined' ? window : globalThis);"]
open(P('src/real.js'), 'w').write('\n'.join(out) + '\n')

# ---------------------------------------------------------------- write src/sizes.js (Wikipedia first, Basketball-Reference career info second)
ci = pd.read_csv(D + 'Player Career Info.csv').dropna(subset=['ht_in_in', 'wt']); ci['k'] = ci.player.map(norm)
cm = ci.sort_values('to').drop_duplicates('k', keep='last').set_index('k')
sizes = {}
for p in keep:
    if p['ht'] and p['wt']: sizes[p['name']] = [p['ht'], p['wt']]
    elif norm(p['name']) in cm.index: sizes[p['name']] = [int(cm.loc[norm(p['name'])].ht_in_in), int(cm.loc[norm(p['name'])].wt)]
for r in base['rookies']:
    w = wiki_of(norm(r[0]), r[1])
    if w and w.get('ht') and w.get('wt'): sizes[r[0]] = [w['ht'], w['wt']]
old = open(P('src/sizes.js')).read(); prev = json.loads(re.search(r'REAL_SIZES = (\{.*?\});', old).group(1))
for n, v in prev.items(): sizes.setdefault(n, v)
open(P('src/sizes.js'), 'w').write('(function (g) {\n  // GENERATED by scripts/build-real.py: [height in inches, weight in lb] of the real-roster players (Wikipedia rosters, then Basketball-Reference)\n'
                                    '  const NBA = (g.NBA = g.NBA || {});\n  NBA.REAL_SIZES = ' + json.dumps(sizes, ensure_ascii=False, separators=(',', ':')) + ';\n})(typeof window !== \'undefined\' ? window : globalThis);\n')
print('\nwrote src/real.js (%d players) and src/sizes.js (%d sizes)' % (len(keep), len(sizes)))
