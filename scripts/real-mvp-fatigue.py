"""MVP voter fatigue, fitted on real voting (1981-2025): beyond production, team wins and scoring, does a candidate's MVP history change his odds?
Conditional logit over each season's 14 best producers (as scripts/real-mvp-model.py), adding history terms one at a time; likelihood-ratio test for each.
Usage: python3 -I scripts/real-mvp-fatigue.py"""
import numpy as np, pandas as pd
D = '/home/user/sumitrodatta/bball-reference-datasets/Data/'
pg = pd.read_csv(D + 'Player Per Game.csv'); adv = pd.read_csv(D + 'Advanced.csv'); ts = pd.read_csv(D + 'Team Summaries.csv'); aw = pd.read_csv(D + 'Player Award Shares.csv')
pg = pg[(pg.lg == 'NBA') & (pg.season >= 1981)]; adv = adv[(adv.lg == 'NBA')][['season', 'player_id', 'team', 'ts_percent']]
pg = pg[pg.team != 'TOT']; d = pg.merge(adv, on=['season', 'player_id', 'team'], how='left')
tw = ts[(ts.lg == 'NBA')][['season', 'abbreviation', 'w', 'l']].rename(columns={'abbreviation': 'team'}); tw['wins'] = tw.w / (tw.w + tw.l) * 82
d = d.merge(tw[['season', 'team', 'wins']], on=['season', 'team'], how='left')
d['perf'] = d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game
full = {y: 82 for y in range(1980, 2027)}; full.update({1999: 50, 2012: 66, 2020: 72, 2021: 72}); d['gf'] = d.g / d.season.map(full).fillna(82)
mv = aw[aw.award == 'nba mvp']; share = mv[['season', 'player_id', 'share']]
win = mv[mv.winner == True][['season', 'player_id']]; W = set(zip(win.season, win.player_id))
d = d.merge(share, on=['season', 'player_id'], how='left').fillna({'share': 0})
d = d[(d.gf >= 0.7) & d.perf.notna() & d.wins.notna()]
def hist(s, p):
    prior = sum(1 for (y, q) in W if q == p and y < s)
    last1 = (s - 1, p) in W; last2 = last1 and (s - 2, p) in W
    in4 = sum(1 for y in range(s - 4, s) if (y, p) in W)
    return prior, int(last1), int(last2), in4
rows = []
for s, g in d.groupby('season'):
    g = g.sort_values('perf', ascending=False).head(14)
    if g.share.max() <= 0: continue
    H = np.array([hist(s, p) for p in g.player_id])
    rows.append((np.c_[g.perf.values, g.wins.values, g.pts_per_game.values, H], int(np.argmax(g.share.values))))
print('seasons', len(rows))
def fit(cols):
    Z = [x[:, cols] for x, _ in rows]; Y = [w for _, w in rows]; b = np.zeros(len(cols))
    for it in range(400):   # Newton steps
        g = np.zeros(len(cols)); H = np.zeros((len(cols), len(cols))); ll = 0
        for z, w in zip(Z, Y):
            u = z @ b; p = np.exp(u - u.max()); p /= p.sum(); ll += np.log(p[w]); m = p @ z; g += z[w] - m; H -= (z * p[:, None]).T @ z - np.outer(m, m)
        step = np.linalg.solve(H - 1e-6 * np.eye(len(cols)), g); b -= step
        if np.abs(step).max() < 1e-9: break
    se = np.sqrt(np.diag(np.linalg.inv(-H)))
    return b, se, ll
names = ['perf', 'wins', 'ppg', 'prior MVPs', 'won last year', 'won last two', 'MVPs in last 4 yrs']
b0, s0, l0 = fit([0, 1, 2]); print('base: ' + ', '.join('%s %.3f' % (names[i], b0[i]) for i in range(3)), '| loglik %.2f' % l0)
for extra in ([5], [4], [3], [6], [5, 3], [5, 6]):
    b, se, l = fit([0, 1, 2] + extra)
    print('+ ' + ' + '.join(names[e] for e in extra) + ': ' + ', '.join('%s %.3f (se %.2f)' % (names[c], b[i], se[i]) for i, c in enumerate([0, 1, 2] + extra)) + ' | loglik %.2f, LR chi2 %.2f' % (l, 2 * (l - l0)))
