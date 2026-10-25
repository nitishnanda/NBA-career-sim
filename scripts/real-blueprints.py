"""Career blueprints from real Basketball-Reference data: for each archetype, what do many real careers look like?

Usage: python3 scripts/real-blueprints.py [path/to/bball-reference-datasets/Data]
Writes data/real-blueprints.json and prints a summary.

Cohorts: players who debuted 1980-2018 (3-point era, mostly complete careers), classified from their five best seasons.
generational (2+ MVP or 5+ All-NBA 1st), dominator (box-score: 5+ ast and 6+ reb, or 30+ triple-doubles), shooter (3-point heavy, 80%+ FT),
scorer (20+ ppg), twoway (1.4+ stl or 1.2+ blk, 15+ ppg, an All-Defense nod), defender (<15 ppg, rim/glass/All-Defense).
Metrics: age curves (absolute and relative to the player's own peak), peak age and width, career length, games played, season-to-season noise,
awards per career (all of which emerge from production, none are quotas).
"""
import json, os, sys
import math
import numpy as np
import pandas as pd

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list): return [clean(v) for v in o]
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)): return None
    return o

D = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/sumitrodatta/bball-reference-datasets/Data').rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-blueprints.json')

GL = pd.read_csv(os.path.join(os.path.dirname(__file__), '..', 'data', 'real-player-season-games.csv')); TD = GL[GL.type == 'rg'].groupby('player').td.sum()
pg = pd.read_csv(D + 'Player Per Game.csv'); adv = pd.read_csv(D + 'Advanced.csv')
aw = pd.read_csv(D + 'Player Award Shares.csv'); eot = pd.read_csv(D + 'End of Season Teams.csv'); asg = pd.read_csv(D + 'All-Star Selections.csv')
car = pd.read_csv(D + 'Player Career Info.csv')

def one_row(df):
    df = df.copy(); df['_t'] = (df.team == 'TOT').astype(int)
    return df.sort_values('_t', ascending=False).drop_duplicates(['season', 'player_id']).drop(columns='_t')
pg = one_row(pg[pg.lg == 'NBA']); adv = one_row(adv[adv.lg == 'NBA'])[['season', 'player_id', 'ts_percent', 'usg_percent', 'x3p_ar', 'vorp', 'ws', 'per']]
d = pg.merge(adv, on=['season', 'player_id'], how='left')
full = {y: 82 for y in range(1980, 2027)}; full.update({1999: 50, 2012: 66, 2020: 72, 2021: 72})
d['gf'] = d.g / d.season.map(full).fillna(82)
# era adjustment: put every season in the modern league environment the sim league is fitted to. Per-game stats scale by the ratio of the
# 2016-25 league average to that season's average among rotation players (40+ games, 24+ mpg); TS% shifts by the difference.
ERA = os.environ.get('ERA', '1') == '1'
d['gfa'] = d.gf
if ERA:
    # games played too: rotation players (24+ mpg, 20+ games) played 90% of games in the 1980s and 76% in 2022-25 (rest, load management);
    # the sim's availability is fitted to 2016-25 (scripts/fit-availability.js), so careers' games-played share is put on that level
    gr = d[(d.mp_per_game >= 24) & (d.g >= 20)].groupby('season').gf.mean()
    d['gfa'] = (d.gf * d.season.map(gr.loc[2016:2025].mean() / gr).fillna(1.0)).clip(upper=1.0)
    rot = d[(d.g >= 40) & (d.mp_per_game >= 24)]
    K = ['pts_per_game', 'trb_per_game', 'ast_per_game', 'stl_per_game', 'blk_per_game', 'tov_per_game', 'mp_per_game']
    lg = rot.groupby('season')[K + ['ts_percent']].mean(); mod = lg.loc[2016:2025].mean()   # the league profile, availability and turnover targets are 2016-25 too
    for k in K: d[k] = d[k] * d.season.map(mod[k] / lg[k]).fillna(1.0)
    d['ts_percent'] = d.ts_percent + d.season.map(mod['ts_percent'] - lg['ts_percent']).fillna(0.0)
d['perf'] = (d.pts_per_game * (1 + 2.2 * (d.ts_percent - 0.57)) + 1.15 * d.trb_per_game + 1.5 * d.ast_per_game + 2 * (d.stl_per_game + d.blk_per_game) - 1.1 * d.tov_per_game)
d = d.rename(columns={'pts_per_game': 'pts', 'trb_per_game': 'reb', 'ast_per_game': 'ast', 'stl_per_game': 'stl', 'blk_per_game': 'blk', 'mp_per_game': 'mpg', 'ft_percent': 'ftp'})
# debut / last season from the full NBA record, BEFORE the 1980 cut (otherwise Kareem 'debuts' in 1980 with half a career)
first = d.groupby('player_id').season.min().rename('debut'); last = d.groupby('player_id').season.max().rename('last')
d = d.merge(first, on='player_id').merge(last, on='player_id')
d = d[d.season >= 1980]
d['exp'] = d.season - d.debut + 1

# awards
mvp = aw[(aw.award == 'nba mvp') & (aw.winner == True)].groupby('player_id').size().rename('mvp')
dpoy = aw[(aw.award == 'dpoy') & (aw.winner == True)].groupby('player_id').size().rename('dpoy')
a1 = eot[(eot.type == 'All-NBA') & (eot.number_tm == '1st')].groupby('player_id').size().rename('allnba1')
anyAN = eot[eot.type == 'All-NBA'].groupby('player_id').size().rename('allnba')
adef = eot[eot.type == 'All-Defense'].groupby('player_id').size().rename('alldef')
asn = asg[asg.get('replaced', False) != True].groupby('player_id').size().rename('allstar') if 'player_id' in asg else None
sc = aw[aw.award == 'nba mvp'][['season', 'player_id']].copy()
vals = pd.concat([mvp, dpoy, a1, anyAN, adef, asn], axis=1).fillna(0)

# team wins (per 82 games) for each season; a traded player's combined (TOT) row has none
tsm = pd.read_csv(D + 'Team Summaries.csv'); tsm = tsm[tsm.lg == 'NBA']; tsm['wins'] = 82 * tsm.w / (tsm.w + tsm.l)
d = d.merge(tsm[['season', 'abbreviation', 'wins']].rename(columns={'abbreviation': 'team'}), on=['season', 'team'], how='left')

# per-player summary of the five best seasons (by perf, 50+ games share)
rows = []
for pid, g in d.groupby('player_id'):
    gg = g[g.gf >= 0.55].sort_values('perf', ascending=False)
    if len(gg) < 5: continue
    t5 = gg.head(5)
    q = g[g.gf >= 0.55].sort_values('age'); bst = q.loc[q.perf.idxmax()]
    pr = q[(q.age >= bst.age - 3) & (q.age <= bst.age + 3)].pts.diff().dropna().abs()
    pos0 = g.pos.astype(str).str.split('-').str[0].mode().iloc[0]
    feat = dict(peakAge=int(bst.age), debutAge=int(g.age.min()), finalAge=int(g.age.max()), seasons=int((g.g >= 20).sum()), careerPts=float((g.pts * g.g).sum()), firstPts=float((lambda f: f.pts.iloc[0] * f.g.iloc[0] if len(f) else 0)(g[g.g >= 20].sort_values('season'))),
                best=float(q.pts.max()), n30=int((q.pts >= 30).sum()), nearWins=float(gg[gg.perf >= t5.perf.mean() - 6].wins.mean()), noise=float(pr.mean()) if len(pr) else None, gpRate=float(g[g.g >= 20].gfa.mean()), pos=pos0)
    rows.append(dict(feat, player_id=pid, player=g.player.iloc[0], td=float(TD.get(g.player.iloc[0], 0)), debut=int(g.debut.iloc[0]), last=int(g.last.iloc[0]), seasons=len(g[g.g >= 20]), pts=t5.pts.mean(), reb=t5.reb.mean(), ast=t5.ast.mean(), ts=100 * t5.ts_percent.mean(), mpg=t5.mpg.mean(), stl=t5.stl.mean(), blk=t5.blk.mean(), ftp=t5.ftp.mean(), ar3=t5.x3p_ar.mean(), usg=t5.usg_percent.mean(), perf=t5.perf.mean(), peakperf=t5.perf.max()))
S = pd.DataFrame(rows).merge(vals, left_on='player_id', right_index=True, how='left').fillna(0)
S = S[(S.debut >= 1980) & (S.debut <= 2018)]

def arch(r):
    # the game's generational talent is the box-score superstar (LeBron, Jordan, Jokic, Shaq): MVP-level honours AND top production;
    # Nash and Kidd (42 peak production vs 47-60 for every other) were great in ways the box score does not show
    if (r.mvp >= 2 or r.allnba1 >= 5) and r.perf >= 45: return 'generational'
    if r.allstar < 1 and r.allnba < 1 and r.alldef < 1 and r.perf < 27: return None   # any All-Star / All-NBA / All-Defense nod, or a solid-starter level of production
    if (r.ast >= 5.0 and r.reb >= 6.0) or r.td >= 30: return 'dominator'   # box-score profile, or 30+ triple-doubles in the game logs
    if r.ar3 >= 0.38 and r.ftp >= 0.80 and r.pts >= 15 and r.reb < 6: return 'shooter'
    if r.pts >= 20: return 'scorer'
    if (r.stl >= 1.4 or r.blk >= 1.2) and r.pts >= 15 and r.alldef >= 1: return 'twoway'
    if r.pts < 15 and (r.blk >= 1.3 or r.reb >= 8.5 or r.alldef >= 2): return 'defender'
    return None
if os.environ.get('DUMP_ALL'): S.to_csv(os.environ['DUMP_ALL'], index=False)   # every candidate career before classification (for checking cohort rules)
S['arch'] = S.apply(arch, axis=1)
S = S[S.arch.notna()]
print(S.groupby('arch').size().to_dict())
print('generational:', ', '.join(S[S.arch == 'generational'].player.tolist()))

# age curves per archetype
dd = d.merge(S[['player_id', 'arch', 'peakperf', 'pts']].rename(columns={'pts': 'peakpts'}), on='player_id')
dd = dd.merge(vals[['allstar']], left_on='player_id', right_index=True, how='left')
res = {}
for a, g in dd.groupby('arch'):
    pl = S[S.arch == a]
    out = {'n': int(len(pl)), 'players': pl.player.tolist()[:60]}
    curve = {}
    for age in range(19, 41):
        x = g[g.age == age]
        if len(x) < 5: continue
        q = lambda c, p: float(np.percentile(x[c], p))
        curve[str(age)] = dict(n=int(len(x)), pts=q('pts', 50), reb=q('reb', 50), ast=q('ast', 50), mpg=q('mpg', 50), gf=q('gf', 50), ts=float(x.ts_percent.median()), usg=float(x.usg_percent.median()), perf=q('perf', 50), perf25=q('perf', 25), perf75=q('perf', 75),
                          rel=float((x.perf / x.peakperf).median()), rel25=float((x.perf / x.peakperf).quantile(0.25)), rel75=float((x.perf / x.peakperf).quantile(0.75)), ptsrel=float((x.pts / x.peakpts).median()), short=float((x.gf < 0.73).mean()))
    out['curve'] = curve
    # peak age, width, career length, noise
    pa, pw, noise, noise_abs, cl = [], [], [], [], []
    for pid, p in g.groupby('player_id'):
        p = p[p.gf >= 0.55].sort_values('age')
        if len(p) < 5: continue
        best = p.loc[p.perf.idxmax()]; pa.append(int(best.age)); pw.append(int((p.perf >= 0.92 * best.perf).sum()))
        prime = p[(p.age >= best.age - 3) & (p.age <= best.age + 3)].sort_values('age')
        dpts = prime.pts.diff().dropna()
        noise.extend(dpts.tolist())
        if p.last.iloc[0] <= 2021: cl.append(int((g[g.player_id == pid].g >= 20).sum()))
    out['peak_age'] = dict(p25=float(np.percentile(pa, 25)), med=float(np.median(pa)), p75=float(np.percentile(pa, 75)))
    out['peak_width92'] = dict(p25=float(np.percentile(pw, 25)), med=float(np.median(pw)), p75=float(np.percentile(pw, 75)), mean=float(np.mean(pw)))
    out['prime_dppg'] = dict(mean_abs=float(np.mean(np.abs(noise))), sd=float(np.std(noise)), share_ge4=float(np.mean(np.abs(noise) >= 4)))
    out['career_len'] = dict(med=float(np.median(cl)), p25=float(np.percentile(cl, 25)), p75=float(np.percentile(cl, 75)), mean=float(np.mean(cl)))
    out['peak5'] = {k: dict(p25=float(pl[k].quantile(.25)), med=float(pl[k].median()), p75=float(pl[k].quantile(.75)), mean=float(pl[k].mean())) for k in ['pts', 'reb', 'ast', 'stl', 'blk', 'perf', 'usg']}
    out['per_career'] = {k: float(pl[k].mean()) for k in ['mvp', 'dpoy', 'allnba1', 'allnba', 'allstar', 'alldef']}
    res[a] = out
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(clean(res), open(OUT, 'w'))
for a, o in res.items():
    print('\n==', a, 'n', o['n'])
    print(' peak age p25/med/p75', o['peak_age']['p25'], o['peak_age']['med'], o['peak_age']['p75'], '| peak width (seasons within 92% of best perf) mean', round(o['peak_width92']['mean'], 1), '| career length med', o['career_len']['med'], 'mean', round(o['career_len']['mean'], 1))
    print(' prime ppg change: mean|d|', round(o['prime_dppg']['mean_abs'], 2), 'sd', round(o['prime_dppg']['sd'], 2), 'share>=4', round(o['prime_dppg']['share_ge4'], 3))
    print(' peak-5 mean ppg/reb/ast/perf/usg', *(round(o['peak5'][k]['mean'], 1) for k in ['pts', 'reb', 'ast', 'perf', 'usg']))
    print(' per career', {k: round(v, 2) for k, v in o['per_career'].items()})
    print(' age: ppg / rel-perf / gf  ' + '  '.join('%s:%.1f/%.2f/%.2f' % (age, c['pts'], c['rel'], c['gf']) for age, c in o['curve'].items() if int(age) % 2 == 0))

# ---- dominance profile: how often are cohort players among the league's top producers, and zig-zag frequency
q = d[d.gf >= 0.7].copy(); q['rank'] = q.groupby('season').perf.rank(ascending=False, method='min')
dd2 = dd.merge(q[['season', 'player_id', 'rank']], on=['season', 'player_id'], how='left')
for a, g in dd2.groupby('arch'):
    n = res[a]['n']
    prof = {f'seasons_rank_le_{k}': float((g['rank'] <= k).sum() / n) for k in (1, 3, 10, 24)}
    zz = 0; cnt = 0
    for pid, p in g.groupby('player_id'):
        p = p[p.gf >= 0.55].sort_values('age')
        if len(p) < 6: continue
        best = p.loc[p.perf.idxmax()]; pr = p[(p.age >= best.age - 3) & (p.age <= best.age + 3)].sort_values('age')
        v = pr.pts.values; cnt += 1
        for i in range(2, len(v)):
            a1, b1 = v[i - 1] - v[i - 2], v[i] - v[i - 1]
            if abs(a1) >= 3 and abs(b1) >= 3 and a1 * b1 < 0: zz += 1
    prof['zigzag_per_career'] = zz / max(1, cnt)
    res[a]['dominance'] = prof
    print(a, {k: round(v, 2) for k, v in prof.items()})
json.dump(clean(res), open(OUT, 'w'))

# ---- per-player career rows for the realism test (scripts/realism-test.js)
cols = ['player', 'debut', 'last', 'pts', 'reb', 'ast', 'stl', 'blk', 'ts', 'mpg', 'perf', 'usg', 'ar3', 'ftp', 'peakAge', 'debutAge', 'finalAge', 'seasons', 'careerPts', 'best', 'n30', 'noise', 'gpRate', 'pos', 'mvp', 'allnba1', 'allnba', 'allstar', 'alldef', 'dpoy', 'td', 'nearWins', 'firstPts']
careers = {a: clean(S[S.arch == a][cols].to_dict('records')) for a in sorted(S.arch.unique())}
json.dump(careers, open(os.path.join(os.path.dirname(OUT), 'real-careers.json'), 'w'))
print('career rows:', {a: len(v) for a, v in careers.items()})
