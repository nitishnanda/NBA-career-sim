"""Real: how many of a season's top-5/top-10 scorers (ppg, 58+ games) were also top-5/top-10 the year before; and run lengths of top-10 membership."""
import pandas as pd, sys
D='/home/user/sumitrodatta/bball-reference-datasets/Data/'
pg=pd.read_csv(D+'Player Per Game.csv'); pg=pg[(pg.lg=='NBA')&(pg.season>=2001)&(pg.season<=2024)&(pg.season not in (2012,2020,2021) if False else True)]
pg=pg.sort_values('team',key=lambda s:(s!='TOT')).drop_duplicates(['season','player_id'])
full={2012:66,2020:72,2021:72}
pg=pg[pg.g>=0.7*pg.season.map(lambda y:full.get(y,82))]
tops={}
for y,g in pg.groupby('season'): tops[y]=g.sort_values('pts_per_game',ascending=False).player_id.tolist()
for k in (5,10):
    ov=[len(set(tops[y][:k])&set(tops[y-1][:k])) for y in tops if y-1 in tops]
    print('real top',k,'repeat from prior year: mean',sum(ov)/len(ov))
# distinct players across 10 seasons in top5
import itertools
ds=[len({p for y in range(a,a+10) for p in tops[y][:5]}) for a in range(2001,2016)]
print('real distinct top-5 scorers in a 10-yr window:',sum(ds)/len(ds))
