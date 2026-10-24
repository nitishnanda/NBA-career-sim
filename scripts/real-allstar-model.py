"""Fit All-Star and All-Defense selection models on real Basketball-Reference data (seasons 2001-2025).

All-Star: logistic on production (perf), scoring, team wins (per 82) and whether the player was an All-Star the year before (reputation).
All-Defense: logistic on steals, blocks, rebounds, minutes, team wins and last year's All-Defense nod.
The sim draws each player's score as the linear predictor plus logistic noise and takes the top 12 per conference (All-Star)
or the top 10 in the league (All-Defense, positionless since 2024), which reproduces these selection probabilities.

Usage: python3 scripts/real-allstar-model.py [path/to/bball-reference-datasets/Data]  -> data/real-allstar-model.json
"""
import json, os, sys
import numpy as np
import pandas as pd

D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-allstar-model.json')

def one(x):
    x = x[x.lg == 'NBA']
    return x.sort_values('team', key=lambda s: (s != 'TOT')).drop_duplicates(['season', 'player_id'])
pg = one(pd.read_csv(D + 'Player Per Game.csv')); adv = one(pd.read_csv(D + 'Advanced.csv'))
d = pg.merge(adv[['season', 'player_id', 'ts_percent']], on=['season', 'player_id'], how='left')
d = d[(d.season >= 2000) & (d.season <= 2025)].copy()
d['perf'] = d.pts_per_game * (1 + 2.2 * (d.ts_percent.fillna(0.55) - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game
ts = pd.read_csv(D + 'Team Summaries.csv'); ts = ts[ts.lg == 'NBA']
ts['wins82'] = ts.w / (ts.w + ts.l) * 82
d = d.merge(ts[['season', 'abbreviation', 'wins82']].rename(columns={'abbreviation': 'team'}), on=['season', 'team'], how='left')
d['wins82'] = d.wins82.fillna(41.0)
asg = pd.read_csv(D + 'All-Star Selections.csv'); asg = asg[asg.lg == 'NBA']
AS = set(zip(asg.season, asg.player_id))
eot = pd.read_csv(D + 'End of Season Teams.csv'); ad = eot[eot.type == 'All-Defense']
AD = set(zip(ad.season, ad.player_id))
d['as'] = [int((s, p) in AS) for s, p in zip(d.season, d.player_id)]
d['ad'] = [int((s, p) in AD) for s, p in zip(d.season, d.player_id)]
d['prevAS'] = [int((s - 1, p) in AS) for s, p in zip(d.season, d.player_id)]
d['prevAD'] = [int((s - 1, p) in AD) for s, p in zip(d.season, d.player_id)]

def logit(X, y, iters=60, ridge=1e-4):
    X = np.column_stack([np.ones(len(X)), X]); b = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ b)); W = p * (1 - p)
        H = X.T @ (X * W[:, None]) + ridge * np.eye(len(b)); g = X.T @ (y - p) - ridge * b
        step = np.linalg.solve(H, g); b += step
        if np.abs(step).max() < 1e-8: break
    return b

fit = d[d.season >= 2001]
A = fit[fit.g >= 40]
bA = logit(A[['perf', 'pts_per_game', 'wins82', 'prevAS']].values, A['as'].values)
B = fit[fit.g >= 50]
bD = logit(B[['stl_per_game', 'blk_per_game', 'trb_per_game', 'mp_per_game', 'wins82', 'prevAD']].values, B['ad'].values)
out = {'allstar': dict(zip(['b0', 'perf', 'pts', 'wins', 'prevAS'], map(float, bA))), 'alldef': dict(zip(['b0', 'stl', 'blk', 'reb', 'mins', 'wins', 'prevAD'], map(float, bD)))}
json.dump(out, open(OUT, 'w'), indent=1)
print(json.dumps(out, indent=1))
# sanity: predicted vs actual selections per season
for nm, X, y, b in [('All-Star', A[['perf', 'pts_per_game', 'wins82', 'prevAS']].values, A['as'].values, bA), ('All-Defense', B[['stl_per_game', 'blk_per_game', 'trb_per_game', 'mp_per_game', 'wins82', 'prevAD']].values, B['ad'].values, bD)]:
    p = 1 / (1 + np.exp(-np.column_stack([np.ones(len(X)), X]) @ b))
    print(nm, 'selections per season: actual', round(y.sum() / 25, 1), 'model', round(p.sum() / 25, 1))
