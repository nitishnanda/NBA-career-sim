"""Real per-age curves for box-score dominators, straight from the Basketball-Reference CSVs plus the game-log triple-double counts.
Pool (1980+, 40+ games a season): five best scoring seasons average 6+ apg and 6+ rpg and 14+ ppg (but under 32 ppg, so scorers like Jordan stay out),
or 30+ triple-doubles in the 2002-24 game logs; and at least 2 All-Star seasons or an All-NBA nod.
'gen' = the generational subset (an MVP, or 4+ All-NBA 1st teams); 'all' = the whole pool.
Writes data/real-gen-dominators.json: {gen: {age: {...}}, all: {...}, _players: {gen: [...], all: [...]}}.
Usage: python3 scripts/real-gen-dominators.py [path/to/bball-reference-datasets/Data]
"""
import json, os, sys
import pandas as pd
D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'data', 'real-gen-dominators.json')
def one(x):
    x = x[x.lg == 'NBA']
    return x.sort_values('team', key=lambda s: (s != 'TOT')).drop_duplicates(['season', 'player_id'])
pg = one(pd.read_csv(D + 'Player Per Game.csv')); adv = one(pd.read_csv(D + 'Advanced.csv'))
d = pg.merge(adv[['season', 'player_id', 'usg_percent', 'ts_percent']], on=['season', 'player_id'], how='left')
d = d[d.season >= 1980].rename(columns={'pts_per_game': 'pts', 'trb_per_game': 'reb', 'ast_per_game': 'ast', 'mp_per_game': 'mpg', 'ts_percent': 'ts', 'usg_percent': 'usg'})
d['gf'] = d.g / 82.0
d = d[d.gf >= 0.5]
asg = pd.read_csv(D + 'All-Star Selections.csv').groupby('player_id').size()
eot = pd.read_csv(D + 'End of Season Teams.csv'); an = eot[eot.type == 'All-NBA'].groupby('player_id').size(); an1 = eot[(eot.type == 'All-NBA') & (eot.number_tm == '1st')].groupby('player_id').size()
mv = pd.read_csv(D + 'Player Award Shares.csv'); mvp = mv[(mv.award == 'nba mvp') & (mv.winner == True)].groupby('player_id').size()
gl = pd.read_csv(os.path.join(ROOT, 'data', 'real-player-season-games.csv')); td = gl[gl.type == 'rg'].groupby('player').td.sum()
pool, gen = [], []
for pid, g in d.groupby('player_id'):
    t = g.nlargest(5, 'pts'); name = g.player.iloc[0]
    prof = t.ast.mean() >= 6 and t.reb.mean() >= 6 and 14 <= t.pts.mean() < 32
    if not ((prof or td.get(name, 0) >= 30) and (asg.get(pid, 0) >= 2 or an.get(pid, 0) >= 1)): continue
    pool.append(pid)
    if mvp.get(pid, 0) >= 1 or an1.get(pid, 0) >= 4: gen.append(pid)
def curves(ids):
    x = d[d.player_id.isin(ids)]; out = {}
    for a in range(19, 41):
        y = x[x.age == a]
        if len(y) < 3: continue
        out[str(a)] = dict(n=int(len(y)), pts=round(float(y.pts.median()), 1), reb=round(float(y.reb.median()), 1), ast=round(float(y.ast.median()), 1), mpg=round(float(y.mpg.median()), 1), usg=round(float(y.usg.median()), 1), ts=round(100 * float(y.ts.median()), 1), gf=round(100 * float(y.gf.median())))
    return out, sorted(x.player.unique().tolist())
cg, ng = curves(gen); ca, na = curves(pool)
json.dump({'gen': cg, 'all': ca, '_players': {'gen': ng, 'all': na}}, open(OUT, 'w'), indent=1)
print('gen pool', len(ng), ng); print('all pool', len(na))
