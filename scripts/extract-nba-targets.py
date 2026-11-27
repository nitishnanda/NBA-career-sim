#!/usr/bin/env python3
"""Real NBA calibration targets from data/sources -> data/nba-targets.json.

Reads the raw Basketball-Reference dumps (NBA Stats 1947-present, champions.csv)
and writes a compact set of benchmarks that scripts/realism-bench.mjs scores
the sim against. Run: python3 scripts/extract-nba-targets.py
"""
import csv, json, os, statistics as st
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'sources', 'NBA Stats (1947-present)')
MODERN = range(2020, 2027)          # season = end year, 2019-20 .. 2025-26
CLASSES = range(1995, 2015)         # completed-career draft classes

def rows(name):
    with open(os.path.join(SRC, name), newline='') as f:
        yield from csv.DictReader(f)

def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None

r1 = lambda x, n=1: round(x, n)
mean = lambda a: st.mean(a) if a else None

# ---- team environment --------------------------------------------------------
tot = defaultdict(float); team_ppg = []
for r in rows('Team Totals.csv'):
    if r['lg'] != 'NBA' or int(r['season']) not in MODERN or r['team'] == 'League Average': continue
    for k in ('fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta', 'pts', 'g'): tot[k] += num(r[k]) or 0
    team_ppg.append(num(r['pts']) / num(r['g']))
team = {
    'ppg': r1(mean(team_ppg)),
    'fg_pct': r1(100 * tot['fg'] / tot['fga']), '3p_pct': r1(100 * tot['x3p'] / tot['x3pa']),
    'ft_pct': r1(100 * tot['ft'] / tot['fta']),
    'ts_pct': r1(100 * tot['pts'] / (2 * (tot['fga'] + 0.44 * tot['fta']))),
    '3pa_rate': r1(100 * tot['x3pa'] / tot['fga']), 'fta_rate': r1(100 * tot['fta'] / tot['fga']),
}

# ---- player seasons (one row per player-season; multi-team TOT row has max g) --
ps = {}
for r in rows('Player Per Game.csv'):
    if r['lg'] != 'NBA': continue
    key = (int(r['season']), r['player_id'])
    if key not in ps or (num(r['g']) or 0) > (num(ps[key]['g']) or 0): ps[key] = r

rot = defaultdict(list); scorers = defaultdict(lambda: [0, 0]); lead = defaultdict(lambda: [0, 0, 0])
age_pts = defaultdict(list)
for (s, pid), r in ps.items():
    if s not in MODERN: continue
    g, mpg, ppg = num(r['g']) or 0, num(r['mp_per_game']) or 0, num(r['pts_per_game']) or 0
    if g >= 40 and mpg >= 20:
        if num(r['fg_percent']) is not None: rot['fg'].append(num(r['fg_percent']))
        if (num(r['x3pa_per_game']) or 0) >= 1 and num(r['x3p_percent']) is not None: rot['3p'].append(num(r['x3p_percent']))
        if (num(r['fta_per_game']) or 0) >= 1 and num(r['ft_percent']) is not None: rot['ft'].append(num(r['ft_percent']))
        rot['ppg'].append(ppg); age_pts[int(r['age'])].append(ppg)
    if g >= 50:
        scorers[s][0] += ppg >= 25; scorers[s][1] += ppg >= 30
        L = lead[s]; L[0] = max(L[0], ppg); L[1] = max(L[1], num(r['trb_per_game']) or 0); L[2] = max(L[2], num(r['ast_per_game']) or 0)

mvp_ppg = [num(ps[(int(r['season']), r['player_id'])]['pts_per_game'])
           for r in rows('Player Award Shares.csv')
           if r['award'] == 'nba mvp' and r['winner'] == 'TRUE' and int(r['season']) in MODERN]

# peak scoring age: completed long careers (debut 1995-2010, >= 8 seasons)
career = defaultdict(list)
for (s, pid), r in ps.items():
    if (num(r['g']) or 0) >= 40: career[pid].append((s, int(r['age']) if r['age'] not in ('', 'NA') else None, num(r['pts_per_game']) or 0))
peaks = [max(c, key=lambda t: t[2])[1] for c in career.values()
         if len(c) >= 8 and 1995 <= min(t[0] for t in c) <= 2010 and all(t[1] for t in c)]
seasons = len(MODERN)
modern = {
    'rotation_fg_pct': r1(100 * mean(rot['fg'])), 'rotation_3p_pct': r1(100 * mean(rot['3p'])),
    'rotation_ft_pct': r1(100 * mean(rot['ft'])), 'rotation_ppg': r1(mean(rot['ppg'])),
    'scorers_25plus_per_season': r1(sum(v[0] for v in scorers.values()) / seasons),
    'scorers_30plus_per_season': r1(sum(v[1] for v in scorers.values()) / seasons),
    'scoring_leader_ppg': r1(mean([v[0] for v in lead.values()])),
    'rebound_leader_rpg': r1(mean([v[1] for v in lead.values()])),
    'assist_leader_apg': r1(mean([v[2] for v in lead.values()])),
    'mvp_ppg': r1(mean(mvp_ppg)),
    'peak_scoring_age_median': st.median(peaks), 'peak_scoring_age_mean': r1(mean(peaks)),
    'rotation_ppg_peak_age': max((a for a in age_pts if len(age_pts[a]) >= 30), key=lambda a: mean(age_pts[a])),
}

# ---- careers & draft ---------------------------------------------------------
yrs = defaultdict(set)
for r in rows('Player Season Info.csv'):
    if r['lg'] == 'NBA': yrs[r['player_id']].add(int(r['season']))
asg = Counter(r['player_id'] for r in rows('All-Star Selections.csv') if r['lg'] == 'NBA')
tiers = {'lottery': (1, 14), 'late_first': (15, 30), 'second_round': (31, 60)}
picks = [(int(r['overall_pick']), r['player_id']) for r in rows('Draft Pick History.csv')
         if r['lg'] == 'NBA' and int(r['season']) in CLASSES and r['overall_pick'] not in ('', 'NA')]
played = [len(yrs[p]) for _, p in picks if yrs[p]]
bucket = lambda lo, hi: r1(100 * sum(lo <= n <= hi for n in played) / len(played))
def tier(lo, hi):
    ids = [p for k, p in picks if lo <= k <= hi]
    ln = [len(yrs[p]) for p in ids if yrs[p]]
    return {'n': len(ids), 'allstar_rate': r1(100 * sum(asg[p] > 0 for p in ids) / len(ids)),
            'never_played_pct': r1(100 * sum(not yrs[p] for p in ids) / len(ids)), 'avg_career_yrs': r1(mean(ln))}
draft = {
    'classes': f'{CLASSES.start}-{CLASSES.stop - 1}', 'n_picks': len(picks),
    'career_len_pct': {'1-3': bucket(1, 3), '4-7': bucket(4, 7), '8-12': bucket(8, 12), '13+': bucket(13, 99)},
    'avg_career_yrs': r1(mean(played)),
    'allstar_avg_career_yrs': r1(mean([len(yrs[p]) for _, p in picks if asg[p] > 0])),
    'tiers': {k: tier(*v) for k, v in tiers.items()},
}

# ---- championship parity -----------------------------------------------------
champs = []
with open(os.path.join(ROOT, 'data', 'sources', 'champions.csv'), newline='') as f:
    rd = csv.reader(f); next(rd); next(rd)
    for r in rd:
        if len(r) > 2 and r[1] == 'NBA' and r[0].isdigit() and 1987 <= int(r[0]) <= 2026: champs.append((int(r[0]), r[2]))
champs = [c for _, c in sorted(champs)]
cc = Counter(champs)
parity = {'years': len(champs), 'unique_champions': len(cc), 'unique_champions_20y': len(set(champs[-20:])),
          'top3_share_pct': r1(100 * sum(n for _, n in cc.most_common(3)) / len(champs))}

out = {'source': 'data/sources (Basketball-Reference dumps); seasons are end years',
       'modern_seasons': f'{MODERN.start}-{MODERN.stop - 1}', 'team': team, 'modern': modern,
       'draft': draft, 'parity': parity}
with open(os.path.join(ROOT, 'data', 'nba-targets.json'), 'w') as f: json.dump(out, f, indent=1)
print('wrote data/nba-targets.json')
