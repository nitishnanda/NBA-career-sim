"""Compute calibration targets from real Basketball-Reference CSVs.

Usage: python3 scripts/real-targets.py [path/to/bball-reference-datasets/Data]
Writes data/real-targets.json and prints a summary.
Source: github.com/sumitrodatta/bball-reference-datasets (Basketball-Reference scrape, through 2025-26).
"""
import json, os, sys
import numpy as np
import pandas as pd

D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-targets.json')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

pg = pd.read_csv(D + 'Player Per Game.csv')
adv = pd.read_csv(D + 'Advanced.csv')
info = pd.read_csv(D + 'Player Season Info.csv')
ts = pd.read_csv(D + 'Team Summaries.csv')
aw = pd.read_csv(D + 'Player Award Shares.csv')
eos = pd.read_csv(D + 'End of Season Teams.csv')
asg = pd.read_csv(D + 'All-Star Selections.csv')
dr = pd.read_csv(D + 'Draft Pick History.csv')

pg = pg[pg.lg == 'NBA'].copy()
adv = adv[adv.lg == 'NBA']
# one row per player-season: the combined (TOT) row if the player changed teams
def one_row(df):
    df = df.copy()
    df['_tot'] = (df.team == 'TOT').astype(int)
    df = df.sort_values('_tot', ascending=False).drop_duplicates(['season', 'player_id'])
    return df.drop(columns='_tot')
pg = one_row(pg)
adv = one_row(adv)[['season', 'player_id', 'ts_percent', 'usg_percent', 'per', 'bpm', 'ws_48', 'vorp']]
d = pg.merge(adv, on=['season', 'player_id'], how='left')
d['perf'] = (d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game
             + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game)
# 82-game seasons only for games-played thresholds
full = {y: 82 for y in range(1981, 2027)}
full.update({1999: 50, 2012: 66, 2020: 72, 2021: 72})
d['gfrac'] = d.g / d.season.map(full).fillna(82)
out = {'source': 'Basketball-Reference via sumitrodatta/bball-reference-datasets', 'through_season': int(d.season.max())}

# ---------------------------------------------------------------- A. production by age (era 2011-2026)
era = d[(d.season >= 2011) & (d.g >= 50) & (d.mp_per_game >= 20)]
by_age = era.groupby('age').perf.agg(['mean', 'count']).round(2)
# paired year-over-year change for players who qualified in both seasons
a = era[['player_id', 'season', 'age', 'perf', 'bpm', 'mp_per_game']]
b = a.copy(); b['season'] = b.season - 1
pair = a.merge(b, on=['player_id', 'season'], suffixes=('', '_next'))
pair['dperf'] = pair.perf_next - pair.perf
pair['dbpm'] = pair.bpm_next - pair.bpm
pair['dmin'] = pair.mp_per_game_next - pair.mp_per_game
age_delta = pair.groupby('age').agg(dperf=('dperf', 'mean'), dbpm=('dbpm', 'mean'), dmin=('dmin', 'mean'), n=('dperf', 'size')).round(2)
# the same for stars only (perf >= 38 in year t, i.e. roughly All-Star level and up)
star_delta = pair[pair.perf >= 38].groupby('age').agg(dperf=('dperf', 'mean'), dbpm=('dbpm', 'mean'), n=('dperf', 'size')).round(2)
out['age_mean_perf'] = {int(k): float(v) for k, v in by_age['mean'].items()}
out['age_delta_perf'] = {int(k): float(v) for k, v in age_delta.dperf.items()}
out['age_delta_perf_n'] = {int(k): int(v) for k, v in age_delta.n.items()}
out['age_delta_bpm'] = {int(k): float(v) for k, v in age_delta.dbpm.items()}
out['star_age_delta_perf'] = {int(k): float(v) for k, v in star_delta.dperf.items()}
out['star_age_delta_perf_n'] = {int(k): int(v) for k, v in star_delta.n.items()}
# peak-age distribution of perf for players with long careers (>= 12 qualified seasons since 1990)
long = d[(d.g >= 50) & (d.mp_per_game >= 20) & (d.season >= 1990)]
cnt = long.groupby('player_id').size()
longids = cnt[cnt >= 10].index
pk = long[long.player_id.isin(longids)].sort_values('perf', ascending=False).drop_duplicates('player_id')
out['peak_age_long_careers'] = {'mean': round(float(pk.age.mean()), 2), 'median': float(pk.age.median()), 'n': int(len(pk)),
                                'hist': {int(k): int(v) for k, v in pk.age.value_counts().sort_index().items()}}


# year-to-year noise: spread of the change in perf for qualified players, by age band, and for stars
out['yoy_perf_sd'] = {'all': round(float(pair.dperf.std()), 2), 'age_24_30': round(float(pair[(pair.age >= 24) & (pair.age <= 30)].dperf.std()), 2),
                      'stars_perf38': round(float(pair[pair.perf >= 38].dperf.std()), 2), 'stars_mean_change': round(float(pair[pair.perf >= 38].dperf.mean()), 2),
                      'stars_mean_change_26_31': round(float(pair[(pair.perf >= 38) & (pair.age >= 26) & (pair.age <= 31)].dperf.mean()), 2),
                      'stars_n': int((pair.perf >= 38).sum())}
# how persistent are star seasons: P(star again next year | star this year, ages 26-31)
stars_now = a[(a.perf >= 38)]
nxt = a.copy(); nxt['season'] = nxt.season - 1
j = stars_now.merge(nxt[['player_id', 'season', 'perf']], on=['player_id', 'season'], how='left', suffixes=('', '_n'))
j26 = j[(j.age >= 26) & (j.age <= 31)]
out['star_persistence'] = {'stay_star_next_year_26_31': round(float((j26.perf_n >= 38).mean()), 3), 'missing_or_qual_fail': round(float(j26.perf_n.isna().mean()), 3), 'n': int(len(j26))}

# ---------------------------------------------------------------- B. scoring distribution by season
rows = []
for y in range(2011, 2027):
    s = d[(d.season == y) & (d.gfrac >= 58 / 82)]
    rows.append({'season': y, 'n30': int((s.pts_per_game >= 30).sum()), 'n28': int((s.pts_per_game >= 28).sum()),
                 'n25': int((s.pts_per_game >= 25).sum()), 'n20': int((s.pts_per_game >= 20).sum()),
                 'top': float(s.pts_per_game.max()), 'top5': float(s.pts_per_game.nlargest(5).mean()),
                 'perf1': float(s.perf.max()), 'perf5': float(s.perf.nlargest(5).mean()), 'perf10': float(s.perf.nlargest(10).mean()),
                 'perf_r24': float(s.perf.nlargest(24).iloc[-1]), 'perf_r10': float(s.perf.nlargest(10).iloc[-1]), 'perf_r50': float(s.perf.nlargest(50).iloc[-1]),
                 'perf24': float(s.perf.nlargest(24).mean()), 'perf50': float(s.perf.nlargest(50).mean()), 'perf100': float(s.perf.nlargest(100).mean())})
sc = pd.DataFrame(rows)
out['scoring_by_season'] = rows
out['scoring_recent_mean'] = {k: round(float(sc[sc.season >= 2016][k].mean()), 2) for k in ['n30', 'n28', 'n25', 'n20', 'top', 'top5', 'perf1', 'perf5', 'perf10', 'perf24', 'perf50', 'perf100', 'perf_r10', 'perf_r24', 'perf_r50']}
# 35+ ppg seasons (qualified) since 1980, and 34+
q = d[(d.gfrac >= 58 / 82) & (d.season >= 1980)]
big = q[q.pts_per_game >= 34][['season', 'player', 'age', 'pts_per_game']].sort_values('pts_per_game', ascending=False)
out['seasons_34plus_since_1980'] = big.values.tolist()
out['n_seasons_35plus_since_1980'] = int((q.pts_per_game >= 35).sum())
out['n_seasons_34plus_since_1980'] = int((q.pts_per_game >= 34).sum())
# 30+ ppg seasons per player among players who ever had one (since 1980)
t30 = q[q.pts_per_game >= 30].groupby('player').size().sort_values(ascending=False)
out['seasons_30plus_per_player'] = {'mean': round(float(t30.mean()), 2), 'top': t30.head(12).to_dict(), 'n_players': int(len(t30)),
                                    'share_with_32plus': round(float((q[q.pts_per_game >= 32].player.nunique()) / len(t30)), 2),
                                    'share_with_34plus': round(float((q[q.pts_per_game >= 34].player.nunique()) / len(t30)), 2)}
# careers: players with >= 25000 points (post-1980 seasons only are partial, so use all)
allp = pg.groupby('player_id').agg(player=('player', 'first'), pts=('pts_per_game', lambda x: 0), g=('g', 'sum'), seasons=('season', 'nunique'))
allp['pts'] = pg.assign(t=pg.pts_per_game * pg.g).groupby('player_id').t.sum()
allp['ppg'] = allp.pts / allp.g
allp['reb'] = pg.assign(t=pg.trb_per_game * pg.g).groupby('player_id').t.sum()
allp['ast'] = pg.assign(t=pg.ast_per_game * pg.g).groupby('player_id').t.sum()
top = allp[allp.pts >= 25000].sort_values('pts', ascending=False)
out['career_25k'] = [{'player': r.player, 'pts': int(r.pts), 'g': int(r.g), 'ppg': round(float(r.ppg), 1), 'seasons': int(r.seasons)} for r in top.itertuples()]
out['career_25k_summary'] = {'n': int(len(top)), 'mean_ppg': round(float(top.ppg.mean()), 1), 'mean_g': int(top.g.mean()), 'mean_seasons': round(float(top.seasons.mean()), 1)}
out['career_30k_summary'] = {'n': int((allp.pts >= 30000).sum()), 'names': allp[allp.pts >= 30000].sort_values('pts', ascending=False).player.tolist()}

# ---------------------------------------------------------------- C. triple-double seasons
tdq = d[(d.g >= 41) & (d.pts_per_game >= 10) & (d.trb_per_game >= 10) & (d.ast_per_game >= 10)]
out['td_seasons'] = tdq[['season', 'player', 'age', 'pts_per_game', 'trb_per_game', 'ast_per_game']].values.tolist()
tdp = tdq.groupby('player').agg(n=('season', 'size'), first=('age', 'min'), last=('age', 'max'), p30=('pts_per_game', lambda x: int((x >= 30).sum())))
out['td_by_player'] = tdp.reset_index().values.tolist()
# near triple-double context: season lines at >= 8 reb & >= 8 ast (qualified) in modern era
near = d[(d.g >= 50) & (d.trb_per_game >= 8) & (d.ast_per_game >= 8) & (d.season >= 2000)]
out['near_td_seasons_since_2000'] = near[['season', 'player', 'age', 'pts_per_game', 'trb_per_game', 'ast_per_game']].values.tolist()
# the career arc of the best-known dominators: ppg/rpg/apg by age
arcs = {}
for pid in ['westbru01', 'jokicni01', 'robertos01', 'doncilu01', 'jamesle01', 'hardeja01', 'johnsma02']:
    s = d[d.player_id == pid].sort_values('age')
    if len(s):
        arcs[s.player.iloc[0]] = s[['age', 'pts_per_game', 'trb_per_game', 'ast_per_game', 'g']].round(1).values.tolist()
out['dominator_arcs'] = arcs

# ---------------------------------------------------------------- D. awards
mvp = aw[(aw.award == 'nba mvp') & (aw.winner == True) & (aw.season >= 1990)][['season', 'player_id', 'player', 'age']]
tw = ts[ts.lg == 'NBA'][['season', 'abbreviation', 'w', 'l']]
m = mvp.merge(d[['season', 'player_id', 'team', 'g', 'pts_per_game', 'trb_per_game', 'ast_per_game', 'perf', 'ts_percent', 'usg_percent']], on=['season', 'player_id'], how='left')
# team wins (82-game equivalent)
tw['w82'] = tw.w / (tw.w + tw.l) * 82
m = m.merge(tw.rename(columns={'abbreviation': 'team'}), on=['season', 'team'], how='left')
out['mvp_winners_since_1990'] = m[['season', 'player', 'age', 'pts_per_game', 'trb_per_game', 'ast_per_game', 'g', 'w82']].round(1).values.tolist()
mm = m[m.season >= 2000]
out['mvp_summary_since_2000'] = {'age_mean': round(float(mm.age.mean()), 1), 'w82_median': round(float(mm.w82.median()), 1), 'w82_min': round(float(mm.w82.min()), 1),
                                 'ppg_mean': round(float(mm.pts_per_game.mean()), 1), 'ppg_min': float(mm.pts_per_game.min()), 'share_ppg_25plus': round(float((mm.pts_per_game >= 25).mean()), 2),
                                 'perf_mean': round(float(mm.perf.mean()), 1), 'usg_mean': round(float(mm.usg_percent.mean()), 1), 'g_min': int(mm.g.min())}
# repeat MVPs: how many per MVP winner (since 1980)
mv_all = aw[(aw.award == 'nba mvp') & (aw.winner == True) & (aw.season >= 1980)].groupby('player').size().sort_values(ascending=False)
out['mvp_counts_since_1980'] = mv_all.to_dict()
# All-NBA 1st team members since 2005: ppg / perf / team wins
a1 = eos[(eos.lg == 'NBA') & (eos.type == 'All-NBA') & (eos.number_tm == '1st') & (eos.season >= 2005)][['season', 'player_id', 'player']]
a1 = a1.merge(d[['season', 'player_id', 'pts_per_game', 'perf', 'g', 'team']], on=['season', 'player_id'], how='left')
out['all_nba_first_since_2005'] = {'ppg_mean': round(float(a1.pts_per_game.mean()), 1), 'ppg_min': float(a1.pts_per_game.min()), 'perf_mean': round(float(a1.perf.mean()), 1),
                                   'perf_min': round(float(a1.perf.min()), 1), 'g_mean': round(float(a1.g.mean()), 1)}
# are high scorers rewarded? share of top-5 scorers (qualified) making All-NBA (any team), since 2010
anyteam = eos[(eos.lg == 'NBA') & (eos.type == 'All-NBA') & (eos.season >= 2010)][['season', 'player_id']].drop_duplicates()
tops = []
for y in range(2010, 2026):
    t5 = d[(d.season == y) & (d.gfrac >= 58 / 82)].nlargest(5, 'pts_per_game')[['season', 'player_id', 'pts_per_game']]
    tops.append(t5)
tops = pd.concat(tops)
tops['allnba'] = tops.merge(anyteam.assign(x=1), on=['season', 'player_id'], how='left').x.fillna(0).values
out['top5_scorers_make_all_nba'] = round(float(tops.allnba.mean()), 2)
# DPOY winners
dp = aw[(aw.award == 'nba dpoy') & (aw.winner == True) & (aw.season >= 2000)].merge(d[['season', 'player_id', 'pos', 'blk_per_game', 'stl_per_game', 'trb_per_game']], on=['season', 'player_id'], how='left')
out['dpoy_since_2000'] = {'blk_mean': round(float(dp.blk_per_game.mean()), 2), 'stl_mean': round(float(dp.stl_per_game.mean()), 2), 'share_bigs': round(float(dp.pos.isin(['C', 'PF', 'C-PF', 'PF-C']).mean()), 2)}

# ---------------------------------------------------------------- E. draft slot -> career outcome (picks 1990-2015)
seasons_played = pg[pg.g > 0].groupby('player_id').season.nunique()
games = pg.groupby('player_id').g.sum()
asn = asg[(asg.lg == 'NBA') & (asg.replaced == False)].groupby('player_id').season.nunique()
an = eos[(eos.lg == 'NBA') & (eos.type == 'All-NBA')][['player_id', 'season']].drop_duplicates().groupby('player_id').size()
dd = dr[(dr.lg == 'NBA') & (dr.season >= 1990) & (dr.season <= 2015)].copy()
dd['seasons'] = dd.player_id.map(seasons_played).fillna(0)
dd['games'] = dd.player_id.map(games).fillna(0)
dd['asg'] = dd.player_id.map(asn).fillna(0)
dd['alln'] = dd.player_id.map(an).fillna(0)
bins = [(1, 1), (2, 3), (4, 5), (6, 10), (11, 14), (15, 20), (21, 30), (31, 45), (46, 60)]
draft = {}
for lo, hi in bins:
    s = dd[(dd.overall_pick >= lo) & (dd.overall_pick <= hi)]
    draft['%d-%d' % (lo, hi)] = {'n': int(len(s)), 'any_asg': round(float((s.asg >= 1).mean()), 3), 'mean_asg': round(float(s.asg.mean()), 2),
                                 'asg3': round(float((s.asg >= 3).mean()), 3), 'any_allnba': round(float((s.alln >= 1).mean()), 3),
                                 'mean_seasons': round(float(s.seasons.mean()), 1), 'seasons_5plus': round(float((s.seasons >= 5).mean()), 3),
                                 'seasons_10plus': round(float((s.seasons >= 10).mean()), 3), 'mean_games': int(s.games.mean()), 'never_played': round(float((s.games == 0).mean()), 3)}
out['draft_outcomes_1990_2015'] = draft
# star supply per draft class: all-stars and 3+ time all-stars per class
cls = dd.groupby('season').agg(asg_any=('asg', lambda x: int((x >= 1).sum())), asg3=('asg', lambda x: int((x >= 3).sum())), mvp_cand=('alln', lambda x: int((x >= 5).sum())))
out['per_class_star_supply'] = {'any_all_star': round(float(cls.asg_any.mean()), 2), 'three_plus_all_star': round(float(cls.asg3.mean()), 2), 'five_plus_all_nba': round(float(cls.mvp_cand.mean()), 2)}
# career length for everyone drafted 1990-2010
dd10 = dd[dd.season <= 2010]
out['career_length_drafted_1990_2010'] = {'mean_seasons': round(float(dd10.seasons.mean()), 1), 'median': float(dd10.seasons.median()),
                                          'first_round_mean': round(float(dd10[dd10.overall_pick <= 30].seasons.mean()), 1)}
# career length among eventual multi-time All-Stars
asg_players = dd10[dd10.asg >= 3]
out['career_length_3plus_asg'] = {'mean_seasons': round(float(asg_players.seasons.mean()), 1), 'mean_games': int(asg_players.games.mean())}

# ---------------------------------------------------------------- F. team wins
t = ts[(ts.lg == 'NBA') & (ts.season >= 2011) & (ts.season <= 2026) & (ts.team != 'League Average')].copy()
t['w82'] = t.w / (t.w + t.l) * 82
sd = t.groupby('season').w82.std()
out['team_wins'] = {'sd_by_season_mean': round(float(sd.mean()), 2), 'share_60plus': round(float((t.w82 >= 60).mean()), 3),
                    'share_55plus': round(float((t.w82 >= 55).mean()), 3), 'share_under_25': round(float((t.w82 < 25).mean()), 3), 'share_under_20': round(float((t.w82 < 20).mean()), 3)}
t['prev'] = t.groupby('abbreviation').w82.shift(1)
tt = t.dropna(subset=['prev'])
out['team_wins']['year_to_year_corr'] = round(float(np.corrcoef(tt.w82, tt.prev)[0, 1]), 3)
out['team_wins']['mean_abs_change'] = round(float((tt.w82 - tt.prev).abs().mean()), 2)
# stars who changed team: destination team's win change the next season (star = perf >= 45, g >= 50, moved teams)
dd2 = d[(d.g >= 50) & (d.season >= 2011) & (d.team != 'TOT')][['season', 'player_id', 'team', 'perf', 'age']]
nx = dd2.copy(); nx['season'] = nx.season - 1
mv = dd2.merge(nx, on=['player_id', 'season'], suffixes=('', '_new'))
mv = mv[(mv.team != mv.team_new) & (mv.perf >= 42)]
tw2 = t[['season', 'abbreviation', 'w82']]
mv = mv.merge(tw2.rename(columns={'abbreviation': 'team_new', 'w82': 'w_before'}).assign(season=lambda x: x.season), on=['season', 'team_new'], how='left')
mv['season_after'] = mv.season + 1
mv = mv.merge(tw2.rename(columns={'abbreviation': 'team_new', 'w82': 'w_after', 'season': 'season_after'}), on=['season_after', 'team_new'], how='left').dropna(subset=['w_before', 'w_after'])
out['star_move_effect'] = {'n': int(len(mv)), 'mean_win_change': round(float((mv.w_after - mv.w_before).mean()), 1), 'median_win_change': round(float((mv.w_after - mv.w_before).median()), 1)}
# top-3 draft picks: team wins change year 1 and 2 (picks 1-3, 2005-2023)
d3 = dr[(dr.lg == 'NBA') & (dr.overall_pick <= 3) & (dr.season >= 2005) & (dr.season <= 2023)][['season', 'overall_pick', 'tm', 'player']]
abbr = ts[['season', 'abbreviation', 'w', 'l']].assign(w82=lambda x: x.w / (x.w + x.l) * 82)
def w_of(season, team):
    r = abbr[(abbr.season == season) & (abbr.abbreviation == team)]
    return float(r.w82.iloc[0]) if len(r) else np.nan
ch1, ch2 = [], []
for r in d3.itertuples():
    b0, w1, w2 = w_of(r.season, r.tm), w_of(r.season + 1, r.tm), w_of(r.season + 2, r.tm)
    if not np.isnan(b0) and not np.isnan(w1): ch1.append(w1 - b0)
    if not np.isnan(b0) and not np.isnan(w2): ch2.append(w2 - b0)
out['top3_pick_team_effect'] = {'n': len(ch1), 'year1_mean_change': round(float(np.mean(ch1)), 1), 'year2_mean_change': round(float(np.mean(ch2)), 1),
                                'year1_share_plus15': round(float((np.array(ch1) >= 15).mean()), 2)}
# bad team (<=28 wins) -> winners the next year, any cause (what share jump 25+ wins)
tb = tt[tt.prev <= 28]
out['bad_team_next_year'] = {'n': int(len(tb)), 'mean_change': round(float((tb.w82 - tb.prev).mean()), 1), 'share_gain_20plus': round(float(((tb.w82 - tb.prev) >= 20).mean()), 3), 'share_gain_25plus': round(float(((tb.w82 - tb.prev) >= 25).mean()), 3), 'share_reach_50': round(float((tb.w82 >= 50).mean()), 3)}

# ---------------------------------------------------------------- G. rookies and minutes
rk = d[(d.season >= 2011) & (d.season <= 2025)].merge(info[['season', 'player_id', 'experience']].drop_duplicates(['season', 'player_id']), on=['season', 'player_id'], how='left')
rk = rk[rk.experience == 1]
rk = rk.merge(dr[['player_id', 'overall_pick']].drop_duplicates('player_id'), on='player_id', how='left')
def rook(lo, hi):
    s = rk[(rk.overall_pick >= lo) & (rk.overall_pick <= hi) & (rk.g >= 40)]
    return {'n': int(len(s)), 'ppg': round(float(s.pts_per_game.mean()), 1), 'mpg': round(float(s.mp_per_game.mean()), 1), 'perf': round(float(s.perf.mean()), 1), 'max_ppg': float(s.pts_per_game.max()) if len(s) else None}
out['rookies_by_pick_2011_2025'] = {'1': rook(1, 1), '2-3': rook(2, 3), '4-5': rook(4, 5), '6-10': rook(6, 10), '11-14': rook(11, 14), '15-30': rook(15, 30), '31-60': rook(31, 60)}
# top rookie scoring seasons
out['rookie_ppg_top'] = rk[rk.g >= 50].sort_values('pts_per_game', ascending=False).head(10)[['season', 'player', 'pts_per_game']].values.tolist()
# prime scorer development: ppg trajectory of players who ever averaged 25+ (age 19-23 mean ppg)
sc25 = d[(d.pts_per_game >= 25) & (d.gfrac >= 58 / 82) & (d.season >= 1990)].player_id.unique()
traj = d[d.player_id.isin(sc25) & (d.season >= 1990) & (d.g >= 40)].groupby('age').pts_per_game.agg(['mean', 'count']).round(1)
out['ppg_by_age_of_25ppg_scorers'] = {int(k): [float(v['mean']), int(v['count'])] for k, v in traj.iterrows()}
# minutes of stars
q2 = d[(d.season >= 2016) & (d.g >= 58) & (d.perf >= 42)]
out['star_minutes'] = {'mean': round(float(q2.mp_per_game.mean()), 1), 'p90': round(float(q2.mp_per_game.quantile(.9)), 1), 'usg_mean': round(float(q2.usg_percent.mean()), 1), 'ts_mean': round(float(q2.ts_percent.mean()), 3)}
# games played of stars by age bucket
st = d[(d.season >= 2011) & (d.perf >= 40) & (d.mp_per_game >= 25) & (d.gfrac > 0)]
out['star_gp_pct_by_age'] = {str(k): round(float(v), 3) for k, v in st.groupby(pd.cut(st.age, [18, 24, 28, 32, 36, 45])).gfrac.mean().items()}

with open(OUT, 'w') as f:
    json.dump(out, f, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
print('wrote', OUT)
