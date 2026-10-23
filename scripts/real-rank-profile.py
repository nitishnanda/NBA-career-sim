"""Production profile by league rank (2016-2025 (the modern era the sim is set in), 58+ games): what the Nth best producer in a season looks like.
Usage: python3 -I scripts/real-rank-profile.py   -> data/real-rank-profile.json"""
import json, os
import pandas as pd
D = '/home/user/sumitrodatta/bball-reference-datasets/Data/'
pg = pd.read_csv(D + 'Player Per Game.csv'); adv = pd.read_csv(D + 'Advanced.csv')
def one(df):
    df = df.copy(); df['_t'] = (df.team == 'TOT').astype(int); return df.sort_values('_t', ascending=False).drop_duplicates(['season', 'player_id']).drop(columns='_t')
pg = one(pg[(pg.lg == 'NBA') & (pg.season >= 2016) & (pg.season <= 2025)]); adv = one(adv[(adv.lg == 'NBA') & (adv.season >= 2016)])[['season', 'player_id', 'ts_percent', 'usg_percent']]
d = pg.merge(adv, on=['season', 'player_id']); d = d[d.g >= 58]
d['perf'] = d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game
d['rank'] = d.groupby('season').perf.rank(ascending=False, method='first')
bins = [(1, 1), (2, 3), (4, 6), (7, 10), (11, 16), (17, 24), (25, 40), (41, 70), (71, 120)]
out = {}
for lo, hi in bins:
    x = d[(d['rank'] >= lo) & (d['rank'] <= hi)]
    out['%d-%d' % (lo, hi)] = dict(mpg=x.mp_per_game.mean(), usg=x.usg_percent.mean(), ts=100 * x.ts_percent.mean(), pts=x.pts_per_game.mean(), reb=x.trb_per_game.mean(), ast=x.ast_per_game.mean(), stl=x.stl_per_game.mean(), blk=x.blk_per_game.mean(), tov=x.tov_per_game.mean(), perf=x.perf.mean(), n=len(x) / 10)
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-rank-profile.json'), 'w'))
for k, v in out.items(): print(k.ljust(7), ' '.join('%s %.1f' % (a, b) for a, b in v.items()))

# league tails per season (players with 58+ games), same era
tails = {}
for key, col, thr in [('pts30', 'pts_per_game', 30), ('pts27', 'pts_per_game', 27), ('pts25', 'pts_per_game', 25), ('pts20', 'pts_per_game', 20), ('pts15', 'pts_per_game', 15), ('ast10', 'ast_per_game', 10), ('ast8', 'ast_per_game', 8), ('ast6', 'ast_per_game', 6), ('reb12', 'trb_per_game', 12), ('reb10', 'trb_per_game', 10), ('reb8', 'trb_per_game', 8), ('stl2', 'stl_per_game', 2), ('blk2', 'blk_per_game', 2)]:
    tails[key] = float((d[col] >= thr).sum() / 10)
tails['top_scorer'] = float(d.groupby('season').pts_per_game.max().mean())
tails['ts_league_avg_qualified'] = float(100 * d.ts_percent.mean())
out['_tails'] = tails
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-rank-profile.json'), 'w'))
print('tails per season', {k: round(v, 2) for k, v in tails.items()})
