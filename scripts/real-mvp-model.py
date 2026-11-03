"""Fit how MVP voters really choose: conditional logit on production, team wins and scoring (1981-2025).
Usage: python3 -I scripts/real-mvp-model.py   -> data/real-mvp-model.json"""
import json, os
import numpy as np, pandas as pd
D = '/home/user/sumitrodatta/bball-reference-datasets/Data/'
pg = pd.read_csv(D + 'Player Per Game.csv'); adv = pd.read_csv(D + 'Advanced.csv'); ts = pd.read_csv(D + 'Team Summaries.csv'); aw = pd.read_csv(D + 'Player Award Shares.csv'); eot = pd.read_csv(D + 'End of Season Teams.csv')
pg = pg[(pg.lg == 'NBA') & (pg.season >= 1981)]; adv = adv[(adv.lg == 'NBA')][['season', 'player_id', 'team', 'ts_percent']]
pg = pg[pg.team != 'TOT']; d = pg.merge(adv, on=['season', 'player_id', 'team'], how='left')
tw = ts[(ts.lg == 'NBA')][['season', 'abbreviation', 'w', 'l']].rename(columns={'abbreviation': 'team'}); tw['wins'] = tw.w / (tw.w + tw.l) * 82
d = d.merge(tw[['season', 'team', 'wins']], on=['season', 'team'], how='left')
d['perf'] = d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game
full = {y: 82 for y in range(1980, 2027)}; full.update({1999: 50, 2012: 66, 2020: 72, 2021: 72}); d['gf'] = d.g / d.season.map(full).fillna(82)
share = aw[aw.award == 'nba mvp'][['season', 'player_id', 'share']]
d = d.merge(share, on=['season', 'player_id'], how='left').fillna({'share': 0})
d = d[(d.gf >= 0.7) & d.perf.notna() & d.wins.notna()]
X, W, seasons = [], [], []
for s, g in d.groupby('season'):
    if g.share.max() <= 0: continue
    g = g.sort_values('perf', ascending=False).head(14)          # voters pick from the league's top producers
    if g.share.max() <= 0 or g.loc[g.share.idxmax(), 'share'] <= 0: continue
    if g.share.idxmax() not in g.index: continue
    X.append(np.c_[g.perf.values, g.wins.values, g.pts_per_game.values]); W.append(int(np.argmax(g.share.values))); seasons.append(s)
print('seasons', len(X))
mu = np.mean(np.vstack(X), axis=0); sd = np.std(np.vstack(X), axis=0)
Z = [(x - mu) / sd for x in X]
b = np.zeros(3)
for it in range(3000):
    grad = np.zeros(3); ll = 0
    for z, w in zip(Z, W):
        u = z @ b; p = np.exp(u - u.max()); p /= p.sum(); ll += np.log(p[w]); grad += z[w] - p @ z
    b += 0.02 * grad / len(Z)
raw = b / sd
print('log-lik per season', round(ll / len(Z), 3), '| coefficients per unit: perf %.3f  team wins %.3f  ppg %.3f' % tuple(raw))
# calibration: how often is the winner the top by score?
hit = np.mean([np.argmax(z @ b) == w for z, w in zip(Z, W)]); top3 = np.mean([w in np.argsort(-(z @ b))[:3] for z, w in zip(Z, W)])
rk = np.mean([int((d[(d.season == s)].perf > d[(d.season == s)].sort_values('perf', ascending=False).head(14).iloc[w].perf).sum()) + 1 for s, w in zip(seasons, W)])
print('model picks the winner', round(hit, 2), 'winner in model top-3', round(top3, 2), '| mean perf-rank of winners', round(rk, 2))
json.dump({'perf': raw[0], 'wins': raw[1], 'ppg': raw[2], 'temp': 1.0, 'candidates': 14}, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-mvp-model.json'), 'w'))

# ---- All-NBA: who makes the three teams (15 spots)? logistic regression among each season's top-35 producers, with a reputation term
# (made All-NBA last season: voters lean on it as they do for All-Star and All-Defense; likelihood-ratio chi2 ~69 on 1 df)
rowsX, rowsY = [], []
an = eot[(eot.type == 'All-NBA')][['season', 'player_id']].drop_duplicates(); an['sel'] = 1
prev = an.assign(season=an.season + 1).rename(columns={'sel': 'prev'})
for s, g in d.groupby('season'):
    g = g.sort_values('perf', ascending=False).head(35).merge(an, on=['season', 'player_id'], how='left').merge(prev, on=['season', 'player_id'], how='left').fillna({'sel': 0, 'prev': 0})
    rowsX.append(np.c_[g.perf.values, g.wins.values, g.pts_per_game.values, g.prev.values]); rowsY.append(g.sel.values)
Xa = np.vstack(rowsX); ya = np.concatenate(rowsY); mua, sda = Xa.mean(0), Xa.std(0); Za = np.c_[np.ones(len(Xa)), (Xa - mua) / sda]
w = np.zeros(5)
for it in range(8000):
    p = 1 / (1 + np.exp(-Za @ w)); w += 0.1 * Za.T @ (ya - p) / len(ya)
ra = w[1:] / sda; icpt = w[0] - (w[1:] * mua / sda).sum()
p = 1 / (1 + np.exp(-(Za @ w))); acc = np.mean((p > 0.5) == ya)
print('All-NBA logit: intercept %.2f  perf %.3f  wins %.3f  ppg %.3f  last season All-NBA %.3f | accuracy %.2f (base rate %.2f)' % (icpt, ra[0], ra[1], ra[2], ra[3], acc, ya.mean()))
m = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-mvp-model.json'))); m['allnba'] = {'icpt': float(icpt), 'perf': float(ra[0]), 'wins': float(ra[1]), 'ppg': float(ra[2]), 'prev': float(ra[3])}
json.dump(m, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-mvp-model.json'), 'w'))
