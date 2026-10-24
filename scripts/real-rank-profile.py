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

# team hierarchy, same era: each team's 1st-4th best scorer / rebounder / passer among players with 40+ games for that team (stints, not TOT rows),
# and how often a team has two 20-ppg scorers etc. (the sim's 'one ball' constraint is checked against this)
pt = pd.read_csv(D + 'Player Per Game.csv'); pt = pt[(pt.lg == 'NBA') & (pt.season >= 2016) & (pt.season <= 2025) & (pt.team != 'TOT') & (~pt.team.str.match(r'^\dTM$'))]
pt = pt[pt.g >= 40 * pt.season.map(lambda y: {2020: 72, 2021: 72}.get(y, 82)) / 82]
team = {}
for k, col in [('pts', 'pts_per_game'), ('reb', 'trb_per_game'), ('ast', 'ast_per_game')]:
    r = [sorted(g[col], reverse=True)[:4] + [0] * max(0, 4 - len(g)) for _, g in pt.groupby(['season', 'team'])]
    team[k] = [float(sum(x[i] for x in r) / len(r)) for i in range(4)]
    if k == 'pts': team['two20'] = float(sum(x[1] >= 20 for x in r) / len(r)); team['two25'] = float(sum(x[1] >= 25 for x in r) / len(r)); team['three20'] = float(sum(x[2] >= 20 for x in r) / len(r))
    if k == 'ast': team['two6ast'] = float(sum(x[1] >= 6 for x in r) / len(r))
    if k == 'reb': team['two8reb'] = float(sum(x[1] >= 8 for x in r) / len(r))
out['_team'] = team
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-rank-profile.json'), 'w'))
print('team hierarchy', {k: (round(v, 3) if isinstance(v, float) else [round(x, 1) for x in v]) for k, v in team.items()})
