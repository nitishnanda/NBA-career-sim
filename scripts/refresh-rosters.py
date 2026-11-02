#!/usr/bin/env python3
"""
Refresh which team each real player is on (data/real-roster-base.json) from Wikipedia's current roster templates.

  python3 scripts/refresh-rosters.py            report only (moves, missing players, age mismatches, transactions since the snapshot)
  python3 scripts/refresh-rosters.py --apply    write the team moves into data/real-roster-base.json, then rebuild the page data:
                                                python3 scripts/build-real.py && python3 scripts/build.py

Source: https://en.wikipedia.org/wiki/Template:<Team>_roster (one per club, raw wikitext, current rosters) and
        https://en.wikipedia.org/wiki/List_of_2026-27_NBA_season_transactions (to show what happened since the snapshot date).
Only team changes are applied. A player who is on no roster any more (retired, released, abroad) or an age that disagrees is only REPORTED:
those need a person to decide. Ratings are not touched here (that is build-real.py / the data build).
Run it after the trade deadline and after the season. Saved careers keep their own league: a refresh only changes NEW careers.
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.join(os.path.dirname(__file__), '..')
BASE = os.path.join(ROOT, 'data/real-roster-base.json')
SNAPSHOT = date(2026, 10, 20)           # the date the table was last refreshed
UA = {'User-Agent': 'NBACareerSimBuild/1.0 (personal project)'}
TEAMS = {'Hawks': 'Atlanta Hawks', 'Celtics': 'Boston Celtics', 'Nets': 'Brooklyn Nets', 'Hornets': 'Charlotte Hornets', 'Bulls': 'Chicago Bulls', 'Cavaliers': 'Cleveland Cavaliers', 'Mavericks': 'Dallas Mavericks', 'Nuggets': 'Denver Nuggets', 'Pistons': 'Detroit Pistons', 'Warriors': 'Golden State Warriors', 'Rockets': 'Houston Rockets', 'Pacers': 'Indiana Pacers', 'Clippers': 'Los Angeles Clippers', 'Lakers': 'Los Angeles Lakers', 'Grizzlies': 'Memphis Grizzlies', 'Heat': 'Miami Heat', 'Bucks': 'Milwaukee Bucks', 'Timberwolves': 'Minnesota Timberwolves', 'Pelicans': 'New Orleans Pelicans', 'Knicks': 'New York Knicks', 'Thunder': 'Oklahoma City Thunder', 'Magic': 'Orlando Magic', '76ers': 'Philadelphia 76ers', 'Suns': 'Phoenix Suns', 'Trail Blazers': 'Portland Trail Blazers', 'Kings': 'Sacramento Kings', 'Spurs': 'San Antonio Spurs', 'Raptors': 'Toronto Raptors', 'Jazz': 'Utah Jazz', 'Wizards': 'Washington Wizards'}


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'’]", ' ', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', s)
    toks = re.sub(r'[^a-z ]', ' ', s).split()
    out, i = [], 0
    while i < len(toks):                       # "p j washington" and "pj washington" are the same person
        j = i
        while j < len(toks) and len(toks[j]) == 1: j += 1
        if j - i >= 2: out.append(''.join(toks[i:j])); i = j
        else: out.append(toks[i]); i += 1
    return ' '.join(out)


def raw(title, tries=5):
    u = 'https://en.wikipedia.org/w/index.php?title=' + urllib.parse.quote(title) + '&action=raw'
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read().decode('utf8')
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(4 * (k + 1))            # 429 (too many requests): back off


def roster_of(nick):
    t = raw('Template:%s roster' % TEAMS[nick]); out = []
    for m in re.finditer(r"\{\{player2?\s*\|(.*?)\}\}", t, flags=re.S):
        body = m.group(1); f = re.search(r'first\s*=\s*([^|]+)', body); l = re.search(r'last\s*=\s*([^|]+)', body)
        if not (f and l): continue
        dob = re.search(r'DOB\s*=\s*(\d{4})-(\d\d)-(\d\d)', body); note = re.search(r'note\s*=\s*([A-Z]+)', body)
        out.append({'name': (f.group(1).strip() + ' ' + l.group(1).strip()), 'dob': date(*map(int, dob.groups())) if dob else None, 'note': note.group(1) if note else ''})
    return out


def main(apply):
    base = json.load(open(BASE)); cur = {}
    for nick in TEAMS:
        cur[nick] = roster_of(nick); time.sleep(1.2)
    where = {}
    for nick, ps in cur.items():
        for p in ps: where.setdefault(norm(p['name']), []).append((nick, p))
    print('rosters read: %d teams, %d players (two-way/G League noted)' % (len(cur), sum(len(v) for v in cur.values())))
    moved, missing, ages = [], [], []
    for r in base['rows']:
        hit = where.get(norm(r['name']))
        if not hit: missing.append((r['name'], r['team'])); continue
        teams = [h[0] for h in hit]
        if r['team'] not in teams: moved.append((r, teams[0]))
        p = hit[0][1]
        if p['dob']:
            a = SNAPSHOT.year - p['dob'].year - ((SNAPSHOT.month, SNAPSHOT.day) < (p['dob'].month, p['dob'].day))
            if abs(a - r['age']) > 1: ages.append((r['name'], r['age'], a))
    rook_moved = []
    for r in base['rookies']:
        hit = where.get(norm(r[0]))
        if not hit: missing.append((r[0] + ' (rookie)', r[1])); continue
        if r[1] not in [h[0] for h in hit]: rook_moved.append((r, hit[0][0]))
    print('\nplayers who changed team: %d' % (len(moved) + len(rook_moved)))
    for r, to in moved: print('  %-26s %-14s -> %s' % (r['name'], r['team'], to))
    for r, to in rook_moved: print('  %-26s %-14s -> %s (rookie)' % (r[0], r[1], to))
    print('on no roster template (retired / released / abroad / spelling): %d' % len(missing))
    for n, t in missing: print('  %-30s was %s' % (n, t))
    print('age differs from the table by 2+ years: %d' % len(ages))
    for n, a, b in ages: print('  %-26s table %d, Wikipedia birthday says %d' % (n, a, b))
    # what happened since the snapshot (a count, for context: two-way deals, waivers and overseas moves are not in the table)
    try:
        t = raw('List of 2026–27 NBA season transactions')
        n = len([l for l in t.split('\n') if re.search(r'(October (2[1-9]|3[01])|November \d+)', l)])
        print('\ntransactions page lines dated after %s: %d (mostly two-way contracts, waivers and overseas moves)' % (SNAPSHOT, n))
    except Exception as e:
        print('\n(transactions page not read: %s)' % e)
    if apply and (moved or rook_moved):
        for r, to in moved: r['team'] = to
        for r, to in rook_moved: r[1] = to
        json.dump(base, open(BASE, 'w'), ensure_ascii=False, indent=1)
        print('\nwrote %s: %d team change(s). Now run: python3 scripts/build-real.py && python3 scripts/build.py' % (BASE, len(moved) + len(rook_moved)))
    elif apply:
        print('\nnothing to apply: the table already matches the current rosters')


if __name__ == '__main__':
    main('--apply' in sys.argv)
