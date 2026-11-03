"""Every real career (not only the notable ones) as a comparison pool for the archetype cards: what the typical pick of an archetype resembles.
Peak line = mean of the five most productive seasons with 45+ games (raw per-game numbers, as people remember them), honours, career length.
Usage: python3 -I scripts/real-comps.py [path/to/bball-reference-datasets/Data]   -> data/real-comps.json (read by scripts/arch-cards.js)"""
import json, os, sys
import pandas as pd
D = sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data/'
pg = pd.read_csv(D + 'Player Per Game.csv'); pg = pg[pg.lg == 'NBA']
pg['tot'] = (pg.team == 'TOT').astype(int); pg = pg.sort_values('tot', ascending=False).drop_duplicates(['player_id', 'season'])   # a traded player's season counts once (his combined row)
adv = pd.read_csv(D + 'Advanced.csv'); adv = adv[adv.lg == 'NBA']; adv['tot'] = (adv.team == 'TOT').astype(int)
adv = adv.sort_values('tot', ascending=False).drop_duplicates(['player_id', 'season'])[['player_id', 'season', 'x3p_ar']]
d = pg.merge(adv, on=['player_id', 'season'], how='left')
d['perf'] = d.pts_per_game + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game.fillna(0) + d.blk_per_game.fillna(0)) - 1.1 * d.tov_per_game.fillna(0)
ast_ = pd.read_csv(D + 'All-Star Selections.csv'); ast_ = ast_[ast_.lg == 'NBA'].groupby('player_id').season.nunique()
eot = pd.read_csv(D + 'End of Season Teams.csv'); an = eot[(eot.lg == 'NBA') & (eot.type == 'All-NBA')].groupby('player_id').season.nunique()
aw = pd.read_csv(D + 'Player Award Shares.csv'); mvp = aw[(aw.award == 'nba mvp') & (aw.winner == True)].groupby('player_id').season.nunique()
rows = []
for pid, g in d.groupby('player_id'):
    debut, last = int(g.season.min()), int(g.season.max())
    if debut < 1980 or debut > 2018 or last > 2024: continue   # finished careers that started in the three-point era
    played = g[g.g >= 20]
    if len(played) < 6: continue
    q = g[g.g >= 45].sort_values('perf', ascending=False).head(5)
    if len(q) < 3: continue
    rows.append(dict(player=g.player.iloc[0], debut=debut, last=last, pts=round(q.pts_per_game.mean(), 2), reb=round(q.trb_per_game.mean(), 2), ast=round(q.ast_per_game.mean(), 2),
                     defn=round((q.stl_per_game.fillna(0) + q.blk_per_game.fillna(0)).mean(), 2), ar3=round(float(q.x3p_ar.fillna(0).mean()), 3),
                     allstar=int(ast_.get(pid, 0)), allnba=int(an.get(pid, 0)), mvp=int(mvp.get(pid, 0)), seasons=len(played), careerPts=int((g.pts_per_game * g.g).sum())))
json.dump(rows, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-comps.json'), 'w'), separators=(',', ':'))
print('careers', len(rows))
