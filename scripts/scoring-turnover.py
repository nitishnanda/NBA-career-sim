"""Real top-scorer turnover and scoring tails: who stays a top scorer, how much top scorers' ppg moves year to year, ages.
Usage: python3 -I scripts/scoring-turnover.py [first_season] [last_season]   -> data/real-scoring-turnover.json (for the default window)"""
import json, os, sys
import numpy as np, pandas as pd
D = '/home/user/sumitrodatta/bball-reference-datasets/Data/'
A, B = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1985, 2025)
pg = pd.read_csv(D + 'Player Per Game.csv'); pg = pg[(pg.lg == 'NBA') & (pg.season >= A - 1) & (pg.season <= B)]
pg = pg.sort_values('team', key=lambda s: (s != 'TOT')).drop_duplicates(['season', 'player_id'])
full = {1999: 50, 2012: 66, 2020: 72, 2021: 72}
pg['q'] = pg.g >= 0.7 * pg.season.map(lambda y: full.get(y, 82))
# scale each season's ppg to the 2016-25 league so tails compare across eras (league scoring moved a lot)
lg = pg[pg.q].groupby('season').pts_per_game.apply(lambda s: s.sort_values(ascending=False).head(150).mean())
ref = lg[(lg.index >= 2016) & (lg.index <= 2025)].mean(); pg['ppg'] = pg.pts_per_game * pg.season.map(ref / lg)
q = pg[pg.q]; tops = {y: g.sort_values('ppg', ascending=False) for y, g in q.groupby('season')}
ys = [y for y in sorted(tops) if y >= A]
out = {}
for k in (5, 10):
    out['top%d_repeat' % k] = float(np.mean([len(set(tops[y].player_id[:k]) & set(tops[y - 1].player_id[:k])) for y in ys if y - 1 in tops]))
out['distinct_top5_10yr'] = float(np.mean([len({p for y in range(a, a + 10) for p in tops[y].player_id[:5]}) for a in ys if a + 9 in tops]))
# top-10 scorers in y-1: next-year ppg change (if qualified both years) and share who still qualify
by = pg.set_index(['season', 'player_id'])
dd, stay = [], []
for y in ys:
    if y - 1 not in tops: continue
    for pid in tops[y - 1].player_id[:10]:
        prev = by.loc[(y - 1, pid)]; nx = by.loc[(y, pid)] if (y, pid) in by.index else None
        stay.append(nx is not None and bool(nx.q))
        if nx is not None and nx.q: dd.append(nx.ppg - prev.ppg)
dd = np.array(dd); out['top10_next_dppg_mean'] = float(dd.mean()); out['top10_next_dppg_sd'] = float(dd.std()); out['top10_next_qualify'] = float(np.mean(stay))
out['top5_age_mean'] = float(np.mean([a for y in ys for a in tops[y].age[:5]]))
out['top1_ppg'] = float(np.mean([tops[y].ppg.iloc[0] for y in ys])); out['top5_ppg'] = float(np.mean([tops[y].ppg.iloc[4] for y in ys])); out['top10_ppg'] = float(np.mean([tops[y].ppg.iloc[9] for y in ys]))
for t in (30, 27, 25, 20): out['pts%d' % t] = float(np.mean([(tops[y].ppg >= t).sum() for y in ys]))
out['top150_ppg'] = float(ref); out['seasons'] = len(ys)
print(json.dumps({k: round(v, 2) for k, v in out.items()}))
if len(sys.argv) <= 2: json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-scoring-turnover.json'), 'w'), indent=1)
