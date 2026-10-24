"""Real per-age curve for generational box-score dominators, straight from the Basketball-Reference CSVs.
Pool: 1980+ players with an MVP whose five best scoring seasons average 6.5+ apg and 7+ rpg (Jokic, Westbrook, Bird, LeBron in the modern data).
Writes data/real-gen-dominators.json: {age: {n, pts, reb, ast, mpg, usg, ts, gf}} (medians, ts in %).
Usage: python3 scripts/real-gen-dominators.py [path/to/bball-reference-datasets/Data]
"""
import json, os, sys
import pandas as pd
D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-gen-dominators.json')
def one(x):
    x = x[x.lg == 'NBA']
    return x.sort_values('team', key=lambda s: (s != 'TOT')).drop_duplicates(['season', 'player_id'])
pg = one(pd.read_csv(D + 'Player Per Game.csv')); adv = one(pd.read_csv(D + 'Advanced.csv'))
d = pg.merge(adv[['season', 'player_id', 'usg_percent', 'ts_percent']], on=['season', 'player_id'], how='left')
d = d[d.season >= 1980].rename(columns={'pts_per_game': 'pts', 'trb_per_game': 'reb', 'ast_per_game': 'ast', 'mp_per_game': 'mpg', 'ts_percent': 'ts', 'usg_percent': 'usg'})
d['gf'] = d.g / 82.0
d = d[d.gf >= 0.5]
mv = pd.read_csv(D + 'Player Award Shares.csv'); mvp = mv[(mv.award == 'nba mvp') & (mv.winner == True)].groupby('player_id').size()
pool = [pid for pid, g in d.groupby('player_id') if g.nlargest(5, 'pts').ast.mean() >= 6.5 and g.nlargest(5, 'pts').reb.mean() >= 7 and mvp.get(pid, 0) >= 1]
x = d[d.player_id.isin(pool)]
out = {}
for a in range(19, 40):
    y = x[x.age == a]
    if len(y) < 3: continue
    out[str(a)] = dict(n=int(len(y)), pts=round(float(y.pts.median()), 1), reb=round(float(y.reb.median()), 1), ast=round(float(y.ast.median()), 1), mpg=round(float(y.mpg.median()), 1), usg=round(float(y.usg.median()), 1), ts=round(100 * float(y.ts.median()), 1), gf=round(100 * float(y.gf.median())))
out['_players'] = sorted(x.player.unique().tolist())
json.dump(out, open(OUT, 'w'), indent=1)
print('players', out['_players'], '->', OUT)
