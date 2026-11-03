"""Rebuild player box scores game by game from real play-by-play, then summarise each player-season.

Source : shufinskiy/nba_data (stats.nba.com play-by-play), datasets/nbastats_YYYY.tar.xz (regular) and nbastats_po_YYYY.tar.xz (playoffs)
Usage  : python3 scripts/real-gamelogs.py [path/to/nba_data/datasets] [first_season_start=2001]
Writes : data/real-player-season-games.csv   (one row per player-season-type)

Per game: points (made FG = 2 or 3 by description, made FT = 1), rebounds (player rebounds), assists (PLAYER2 on a made FG),
steals (PLAYER2 on a turnover), blocks (PLAYER3 on a missed FG). Triple-double = three of the five at 10+ (the official rule).
"""
import io, os, sys, tarfile
import numpy as np
import pandas as pd

DS = (sys.argv[1] if len(sys.argv) > 1 else '/home/user/shufinskiy/nba_data/datasets').rstrip('/') + '/'
FIRST = int(sys.argv[2]) if len(sys.argv) > 2 else 2001
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'real-player-season-games.csv')
COLS = ['GAME_ID', 'EVENTMSGTYPE', 'HOMEDESCRIPTION', 'VISITORDESCRIPTION', 'PLAYER1_ID', 'PLAYER1_NAME', 'PLAYER2_ID', 'PLAYER2_NAME', 'PLAYER3_ID', 'PLAYER3_NAME']


def load(path):
    with tarfile.open(path, 'r:xz') as t:
        m = [x for x in t.getmembers() if x.name.endswith('.csv')][0]
        return pd.read_csv(io.BytesIO(t.extractfile(m).read()), usecols=COLS, low_memory=False)


def box(df):
    desc = df.HOMEDESCRIPTION.fillna('') + ' ' + df.VISITORDESCRIPTION.fillna('')
    et = df.EVENTMSGTYPE
    p1, p2, p3 = df.PLAYER1_ID.fillna(0).astype('int64'), df.PLAYER2_ID.fillna(0).astype('int64'), df.PLAYER3_ID.fillna(0).astype('int64')
    is_player = lambda s: (s > 0) & (s < 1_000_000_000)
    parts = []
    fg = (et == 1) & is_player(p1)
    parts.append(pd.DataFrame({'gid': df.GAME_ID[fg], 'pid': p1[fg], 'pts': np.where(desc[fg].str.contains('3PT'), 3, 2)}))
    ft = (et == 3) & is_player(p1) & ~desc.str.upper().str.contains('MISS')
    parts.append(pd.DataFrame({'gid': df.GAME_ID[ft], 'pid': p1[ft], 'pts': 1}))
    rb = (et == 4) & is_player(p1)
    parts.append(pd.DataFrame({'gid': df.GAME_ID[rb], 'pid': p1[rb], 'reb': 1}))
    ast = (et == 1) & is_player(p2)
    parts.append(pd.DataFrame({'gid': df.GAME_ID[ast], 'pid': p2[ast], 'ast': 1}))
    stl = (et == 5) & is_player(p2)
    parts.append(pd.DataFrame({'gid': df.GAME_ID[stl], 'pid': p2[stl], 'stl': 1}))
    blk = (et == 2) & is_player(p3)
    parts.append(pd.DataFrame({'gid': df.GAME_ID[blk], 'pid': p3[blk], 'blk': 1}))
    b = pd.concat(parts, ignore_index=True).fillna(0)
    b = b.groupby(['gid', 'pid'], as_index=False).sum()
    for c in ['pts', 'reb', 'ast', 'stl', 'blk']:
        if c not in b: b[c] = 0
    names = pd.concat([df[['PLAYER1_ID', 'PLAYER1_NAME']].set_axis(['pid', 'name'], axis=1), df[['PLAYER2_ID', 'PLAYER2_NAME']].set_axis(['pid', 'name'], axis=1),
                       df[['PLAYER3_ID', 'PLAYER3_NAME']].set_axis(['pid', 'name'], axis=1)]).dropna().drop_duplicates('pid')
    names['pid'] = names.pid.astype('int64')
    return b.merge(names, on='pid', how='left')


def summarise(b, season, kind):
    cats = (b[['pts', 'reb', 'ast', 'stl', 'blk']] >= 10).sum(axis=1)
    b = b.assign(td=(cats >= 3).astype(int), dd=(cats >= 2).astype(int), g30=(b.pts >= 30).astype(int), g40=(b.pts >= 40).astype(int), g50=(b.pts >= 50).astype(int), g60=(b.pts >= 60).astype(int))
    g = b.groupby('pid').agg(player=('name', 'first'), g=('gid', 'nunique'), pts=('pts', 'mean'), reb=('reb', 'mean'), ast=('ast', 'mean'), stl=('stl', 'mean'), blk=('blk', 'mean'),
                             td=('td', 'sum'), dd=('dd', 'sum'), g30=('g30', 'sum'), g40=('g40', 'sum'), g50=('g50', 'sum'), g60=('g60', 'sum'), maxpts=('pts', 'max'),
                             sd_pts=('pts', 'std'), sd_reb=('reb', 'std'), sd_ast=('ast', 'std')).reset_index()
    g.insert(0, 'season', season); g.insert(1, 'type', kind)
    return g


rows = []
for y in range(FIRST, 2025):
    for kind, fn in [('rg', 'nbastats_%d.tar.xz' % y), ('po', 'nbastats_po_%d.tar.xz' % y)]:
        path = DS + fn
        if not os.path.exists(path): continue
        b = box(load(path))
        rows.append(summarise(b, y + 1, kind))
        print(y + 1, kind, len(b), 'player-games', flush=True)
res = pd.concat(rows, ignore_index=True).round(3)
res.to_csv(OUT, index=False)
print('wrote', OUT, len(res), 'rows')
