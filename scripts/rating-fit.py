# Checks the in-game match rating against real Sofascore ratings.
# data/sofascore-sample.csv: 399 player-games (347 rated) from the 154-game sheet "Sofascore NBA box scores + player ratings (Oct 2026)"; the full fit (3,037 rated games) is in that sheet's Regression tab.
# Prints the RMSE/bias of: the published box-score model (what src/engine.js uses before a game's result is known), the previous in-game formula, and a refit on this slice.
import csv, math
rows = [r for r in csv.DictReader(open('data/sofascore-sample.csv')) if r['rating'] != '']
f = lambda r, k: float(r[k])
feat = lambda r: [1, f(r,'pts'), f(r,'reb'), f(r,'ast'), f(r,'stl'), f(r,'blk'), f(r,'tov'), f(r,'pf'), f(r,'fga')-f(r,'fgm'), f(r,'fta')-f(r,'ftm'), f(r,'tpm'), f(r,'min')]
A = [6.0118, 0.0817, 0.053, 0.1155, 0.1083, 0.0918, -0.1284, -0.044, -0.0903, -0.0783, 0.0383, -0.0027]
y = [f(r,'rating') for r in rows]
def report(name, pred):
    rm = math.sqrt(sum((p-t)**2 for p,t in zip(pred,y))/len(y)); b = sum(p-t for p,t in zip(pred,y))/len(y)
    print(f'{name:34s} RMSE {rm:.3f}  bias {b:+.3f}  (n={len(y)})')
report('published Model A (in the game)', [sum(a*b for a,b in zip(A, feat(r))) for r in rows])
def old(r):
    poe = f(r,'pts') - 0.8*(f(r,'fga') + 0.44*f(r,'fta'))
    sw = 0.111*poe + 0.065*f(r,'reb') + 0.089*f(r,'ast') + 0.054*f(r,'stl') + 0.171*f(r,'blk') - 0.146*f(r,'tov') - 0.484*min(1, f(r,'min')/36)
    return min(10, max(3, 6.5 + 0.86*sw*min(1, f(r,'min')/14)))
report('previous formula', [old(r) for r in rows])
try:
    import numpy as np
    X = np.array([feat(r) for r in rows]); b = np.linalg.lstsq(X, np.array(y), rcond=None)[0]
    report('refit on this slice', list(X @ b))
except ImportError:
    pass
