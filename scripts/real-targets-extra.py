"""Playoff and salary targets from real data.

Usage: python3 scripts/real-targets-extra.py [bref_Data_dir] [site_data_dir]
  bref_Data_dir : sumitrodatta/bball-reference-datasets/Data   (regular season, B-Ref scrape)
  site_data_dir : gabriel1200/site_data                         (playoffs, salaries, cap history)
Writes data/real-targets-extra.json
"""
import json, os, re, sys, unicodedata
import numpy as np
import pandas as pd

B = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
S = (sys.argv[2] if len(sys.argv) > 2 else '/home/user/gabriel1200/site_data').rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-targets-extra.json')
out = {}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’*]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', s)
    return ' '.join(re.sub(r'[^a-z ]', ' ', s).split())


def one(df):
    df = df.copy(); df['_t'] = (df.team == 'TOT').astype(int)
    return df.sort_values('_t', ascending=False).drop_duplicates(['season', 'player_id']).drop(columns='_t')


pg = one(pd.read_csv(B + 'Player Per Game.csv').query("lg == 'NBA'"))
adv = one(pd.read_csv(B + 'Advanced.csv').query("lg == 'NBA'"))[['season', 'player_id', 'ts_percent', 'usg_percent', 'bpm']]
reg = pg.merge(adv, on=['season', 'player_id'])
reg['perf'] = (reg.pts_per_game * (1 + 2.2 * (reg.ts_percent - 0.57)) + 1.15 * reg.trb_per_game + 1.5 * reg.ast_per_game
               + 2 * (reg.stl_per_game + reg.blk_per_game) - 1.1 * reg.tov_per_game)

# ------------------------------------------------------------------ PLAYOFFS vs REGULAR SEASON
po = pd.read_csv(S + 'tplayer_stats_ps.csv')
po = po[po.G >= 1].copy()
for c in ['PTS', 'TRB', 'AST', 'STL', 'BLK', 'TOV', 'MP']:
    po[c + '_pg'] = po[c] / po.G
po['mpg'] = po.MP / po.G
po = po.rename(columns={'bref_id': 'player_id', 'year': 'season'})
po['perf_po'] = (po.PTS_pg * (1 + 2.2 * (po['TS%'] - 0.57)) + 1.15 * po.TRB_pg + 1.5 * po.AST_pg + 2 * (po.STL_pg + po.BLK_pg) - 1.1 * po.TOV_pg.fillna(0))
m = reg.merge(po[['player_id', 'season', 'G', 'mpg', 'PTS_pg', 'TRB_pg', 'AST_pg', 'STL_pg', 'BLK_pg', 'TOV_pg', 'TS%', 'USG%', 'perf_po']], on=['player_id', 'season'], suffixes=('', '_po'))
m = m[(m.season >= 2001) & (m.g >= 50) & (m.mp_per_game >= 25) & (m.G >= 4)].copy()
m['ts_po'] = m['TS%'] ; m['usg_po'] = m['USG%']


def ratios(x):
    r = {'n': int(len(x)),
         'mpg_ratio': round(float((x.mpg / x.mp_per_game).mean()), 3), 'mpg_reg': round(float(x.mp_per_game.mean()), 1), 'mpg_po': round(float(x.mpg.mean()), 1),
         'pts_ratio': round(float((x.PTS_pg / x.pts_per_game).mean()), 3), 'pts_reg': round(float(x.pts_per_game.mean()), 1), 'pts_po': round(float(x.PTS_pg.mean()), 1),
         'reb_ratio': round(float((x.TRB_pg / x.trb_per_game).mean()), 3), 'ast_ratio': round(float((x.AST_pg / x.ast_per_game.replace(0, np.nan)).mean()), 3),
         'stl_ratio': round(float((x.STL_pg / x.stl_per_game.replace(0, np.nan)).mean()), 3), 'blk_ratio': round(float((x.BLK_pg / x.blk_per_game.replace(0, np.nan)).mean()), 3),
         'tov_ratio': round(float((x.TOV_pg / x.tov_per_game.replace(0, np.nan)).mean()), 3),
         'ts_change': round(float((x.ts_po / 100 - x.ts_percent).mean()), 4), 'usg_change': round(float((x.usg_po - x.usg_percent).mean()), 2),
         'perf_ratio': round(float((x.perf_po / x.perf).mean()), 3)}
    pr = (x.PTS_pg / x.pts_per_game)
    r['pts_ratio_sd'] = round(float(pr.std()), 3)
    r['share_pts_up_15pct'] = round(float((pr >= 1.15).mean()), 3); r['share_pts_up_25pct'] = round(float((pr >= 1.25).mean()), 3); r['share_pts_down_15pct'] = round(float((pr <= 0.85).mean()), 3)
    pf = x.perf_po / x.perf
    r['share_perf_up_20pct'] = round(float((pf >= 1.2).mean()), 3); r['share_perf_up_30pct'] = round(float((pf >= 1.3).mean()), 3)
    return r


out['playoff_vs_regular'] = {'all_rotation_players': ratios(m), 'stars_perf40': ratios(m[m.perf >= 40]), 'stars_perf48': ratios(m[m.perf >= 48]), 'scorers_25ppg': ratios(m[m.pts_per_game >= 25])}
# the best individual playoff runs (min 10 games)
runs = po[(po.G >= 10)].sort_values('PTS_pg', ascending=False).head(15)
out['top_playoff_scoring_runs'] = runs[['season', 'player', 'G', 'PTS_pg', 'TRB_pg', 'AST_pg']].round(1).values.tolist()
td = po[(po.G >= 4) & (po.PTS_pg >= 10) & (po.TRB_pg >= 10) & (po.AST_pg >= 10)]
out['playoff_triple_double_runs'] = td[['season', 'player', 'G', 'PTS_pg', 'TRB_pg', 'AST_pg']].round(1).values.tolist()
big = po[(po.G >= 4) & (po.PTS_pg >= 35)]
out['playoff_35ppg_runs_4plus_games'] = big[['season', 'player', 'G', 'PTS_pg']].round(1).values.tolist()
# number of playoff games for a star on a champion vs a first-round exit (to sanity-check series length)
star_po = m[m.perf >= 44]
out['star_playoff_games'] = {'mean': round(float(star_po.G.mean()), 1), 'p25': float(star_po.G.quantile(.25)), 'median': float(star_po.G.median()), 'p75': float(star_po.G.quantile(.75)), 'max': int(star_po.G.max())}
# how often is a regular-season star's playoff run in the top tier (perf_po >= 45)?
out['playoff_perf_distribution_stars_perf44plus'] = {'mean_playoff_perf': round(float(star_po.perf_po.mean()), 1), 'mean_regular_perf': round(float(star_po.perf.mean()), 1)}

# ------------------------------------------------------------------ SALARIES
sal = pd.read_csv(S + 'nba_salaries_master.csv').dropna(subset=['salary'])
cap = pd.read_csv(S + 'cap.csv')[['year', 'Salary Cap']].rename(columns={'Salary Cap': 'cap'}).dropna()
cap = cap.drop_duplicates('year').sort_values('year')
out['cap_history'] = {int(r.year): float(r.cap) for r in cap.itertuples()}
growth = (cap.set_index('year').cap.pct_change() * 100).round(1)
out['cap_growth_pct'] = {int(k): float(v) for k, v in growth.dropna().items() if k >= 2006}
sal['key'] = sal.player.map(norm)
sal = sal.merge(cap, on='year', how='left')
sal['pct'] = sal.salary / sal.cap
reg['key'] = reg.player.map(norm)
sm = reg[(reg.season >= 2005) & (reg.g >= 25)].merge(sal[['key', 'year', 'salary', 'pct', 'cap']].rename(columns={'year': 'season'}), on=['key', 'season'], how='inner')
# a player appears on one row per season; keep the max salary row if a name clash
sm = sm.sort_values('salary', ascending=False).drop_duplicates(['player_id', 'season'])
sm['rank'] = sm.groupby('season').perf.rank(ascending=False, method='first')
bins = [(1, 5), (6, 10), (11, 24), (25, 50), (51, 100), (101, 150), (151, 250), (251, 600)]
tbl = {}
for lo, hi in bins:
    x = sm[(sm['rank'] >= lo) & (sm['rank'] <= hi)]
    tbl['%d-%d' % (lo, hi)] = {'n': int(len(x)), 'mean_pct_cap': round(float(x.pct.mean()), 4), 'median_pct_cap': round(float(x.pct.median()), 4), 'p90_pct_cap': round(float(x.pct.quantile(.9)), 4), 'mean_salary_m': round(float(x.salary.mean() / 1e6), 1)}
out['salary_pct_cap_by_perf_rank_2005plus'] = tbl
# by age for good players (perf rank <= 60)
good = sm[sm['rank'] <= 60]
out['salary_pct_cap_by_age_top60'] = {int(a): round(float(v), 4) for a, v in good.groupby(pd.cut(good.age, [18, 21, 24, 27, 30, 33, 45], labels=[21, 24, 27, 30, 33, 45])).pct.mean().items()}
# max-contract frequency: seasons where salary >= 30% of the cap
out['share_of_top24_seasons_at_30pct_cap_or_more'] = round(float((sm[sm['rank'] <= 24].pct >= 0.30).mean()), 3)
out['share_of_top5_seasons_at_30pct_cap_or_more'] = round(float((sm[sm['rank'] <= 5].pct >= 0.30).mean()), 3)
out['highest_pct_of_cap_seen'] = round(float(sm.pct.max()), 3)
# career earnings: nominal and in cap-years (salary / that year's cap), players with careers completed inside the data window
sal2 = sal.dropna(subset=['pct', 'nba_id'])
car = sal2.groupby('nba_id').agg(player=('player', 'first'), first=('year', 'min'), last=('year', 'max'), seasons=('year', 'nunique'), nominal=('salary', 'sum'), capyears=('pct', 'sum')).reset_index()
car['nominal_m'] = car.nominal / 1e6
# All-Star counts and best perf seasons by bref->name
asg = pd.read_csv(B + 'All-Star Selections.csv'); asg = asg[(asg.lg == 'NBA') & (asg.replaced == False)]
asg['key'] = asg.player.map(norm); asn = asg.groupby('key').season.nunique()
car['key'] = car.player.map(norm); car['asg'] = car.key.map(asn).fillna(0)
done = car[(car['first'] >= 1996) & (car['last'] <= 2021) & (car.seasons >= 3)]
tiers = {'never_all_star': done[done.asg == 0], '1-2 all-star': done[(done.asg >= 1) & (done.asg <= 2)], '3-5 all-star': done[(done.asg >= 3) & (done.asg <= 5)], '6-9 all-star': done[(done.asg >= 6) & (done.asg <= 9)], '10+ all-star': done[done.asg >= 10]}
out['career_earnings_by_all_star_tier_1996_2021_careers'] = {k: {'n': int(len(v)), 'mean_seasons': round(float(v.seasons.mean()), 1), 'mean_nominal_m': round(float(v.nominal_m.mean()), 0), 'median_nominal_m': round(float(v.nominal_m.median()), 0), 'mean_cap_years': round(float(v.capyears.mean()), 2), 'max_nominal_m': round(float(v.nominal_m.max()), 0)} for k, v in tiers.items() if len(v)}
top = car.sort_values('nominal', ascending=False).head(15)
out['top_career_salary_totals_through_2024_m'] = [[r.player, int(r.nominal_m), int(r.first), int(r.last), round(float(r.capyears), 1)] for r in top.itertuples()]
# salary of a rookie contract by pick, in % of cap (first-round picks 2010+)
dr = pd.read_csv(B + 'Draft Pick History.csv').query("lg == 'NBA' and season >= 2012")
dr['key'] = dr.player.map(norm)
rk = dr.merge(sal[['key', 'year', 'pct', 'salary']].assign(season=lambda x: x.year), on=['key', 'season'], how='inner')
rk = rk[(rk.overall_pick <= 60)]
rb = {}
for lo, hi in [(1, 1), (2, 5), (6, 14), (15, 30), (31, 60)]:
    x = rk[(rk.overall_pick >= lo) & (rk.overall_pick <= hi)]
    if len(x): rb['%d-%d' % (lo, hi)] = {'n': int(len(x)), 'rookie_year_pct_cap': round(float(x.pct.mean()), 4), 'rookie_year_salary_m': round(float(x.salary.mean() / 1e6), 2)}
out['rookie_year_salary_by_pick_2012plus'] = rb

json.dump(out, open(OUT, 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
print('wrote', OUT)
