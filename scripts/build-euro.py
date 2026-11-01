#!/usr/bin/env python3
"""Build src/eurodata.js: the 2026-27 EuroLeague and NBA G League clubs and rosters, from Wikipedia wikitext (cached in /tmp/eurocache).

EuroLeague: the club list comes from the 2026-27 EuroLeague article; each club's roster from its 2026-27 season article (or its roster template).
G League: the club list (city, pod, affiliate) from the NBA G League article; rosters from each club's roster template (G League rosters churn all year:
these are the most recent Wikipedia snapshots). Ratings are a heuristic on the NBA OVR scale (club strength, age, role on assignment / two-way, and
a short list of well-known EuroLeague stars); they are not measured from stats. Crests are generated in the game from the club colours below.
"""
import json, os, re, sys, hashlib, urllib.parse, urllib.request, datetime

CACHE = '/tmp/eurocache'; os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'NBACareerSimBuild/1.0 (personal hobby project; contact via github nitishnanda)'}

def raw(title):
    f = os.path.join(CACHE, hashlib.md5(title.encode()).hexdigest() + '.txt')
    if os.path.exists(f): return open(f, encoding='utf8').read()
    url = 'https://en.wikipedia.org/w/index.php?title=' + urllib.parse.quote(title.replace(' ', '_')) + '&action=raw'
    try:
        t = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf8')
    except Exception as e:
        print('fetch failed', title, e, file=sys.stderr); t = ''
    if t.lstrip().startswith('<!DOCTYPE'): t = ''
    open(f, 'w', encoding='utf8').write(t); return t

def follow_redirect(title, t):
    m = re.match(r'\s*#REDIRECT\s*\[\[([^\]|#]+)', t, re.I)
    return (m.group(1), raw(m.group(1))) if m else (title, t)

def params(tpl):
    out = {}
    for part in re.split(r'\|(?![^\[]*\]\])', tpl)[1:]:
        if '=' in part:
            k, v = part.split('=', 1); out[k.strip().lower()] = v.strip()
    return out

def strip_links(s):
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    return re.sub(r"'''?|<[^>]+>", '', s).strip()

POS = {'PG': 'PG', 'G': 'SG', 'SG': 'SG', 'GF': 'SF', 'SF': 'SF', 'F': 'PF', 'PF': 'PF', 'FC': 'C', 'C': 'C', 'SF/PF': 'SF', 'PG/SG': 'PG'}
NOW = datetime.date(2026, 10, 20)

def players_in(text):
    out = []
    for m in re.finditer(r'\{\{\s*(player3|player2|basketball roster player|player)\s*\|', text, re.I):
        depth, i = 0, m.start()
        while i < len(text):
            if text.startswith('{{', i): depth += 1; i += 2; continue
            if text.startswith('}}', i):
                depth -= 1; i += 2
                if depth == 0: break
                continue
            i += 1
        tpl = text[m.start() + 2:i - 2]; p = params(tpl)
        first, last = strip_links(p.get('first', '')), strip_links(p.get('last', ''))
        name = (first + ' ' + last).strip() or strip_links(p.get('name', ''))
        if not name or len(name) < 4: continue
        pos = POS.get(p.get('pos', '').upper().replace(' ', ''), 'SF')
        ht = None
        if p.get('m'):
            try: ht = round(float(p['m'].replace(',', '.')) * 39.37)
            except ValueError: pass
        elif p.get('ft'):
            try: ht = int(p['ft']) * 12 + int(re.sub(r'\D', '', p.get('in', '0')) or 0)
            except ValueError: pass
        age = None
        if p.get('year'):
            try:
                y, mo, d = int(p['year']), int(re.sub(r'\D', '', p.get('month', '6')) or 6), int(re.sub(r'\D', '', p.get('date', p.get('day', '15'))) or 15)
                age = NOW.year - y - ((NOW.month, NOW.day) < (mo, d))
            except ValueError: pass
        elif p.get('dob'):
            mm = re.match(r'(\d{4})-(\d{2})-(\d{2})', p['dob'])
            if mm: y, mo, d = map(int, mm.groups()); age = NOW.year - y - ((NOW.month, NOW.day) < (mo, d))
        nat = (p.get('nat') or 'USA').upper()[:3]
        note = (p.get('note') or '').upper()
        out.append({'name': name, 'pos': pos, 'age': age or 25, 'ht': ht, 'nat': nat, 'note': 'TW' if 'TW' in note else 'NBA' if 'NBA' in note else '', 'college': strip_links(p.get('college', ''))})
    seen, res = set(), []
    for x in out:
        if x['name'] not in seen: seen.add(x['name']); res.append(x)
    return res

def head_coach(text):
    m = re.search(r'head_coach\s*=\s*\n?\*?\s*(.+)', text)
    if not m: return ''
    c = m.group(1)
    mm = re.search(r'\{\{player\|\|\w*\|(.+?)\}\}', c)
    return strip_links(mm.group(1) if mm else c).strip('| ')[:40]

# ---------------------------------------------------------------- EuroLeague
el = raw('2026–27 EuroLeague')
sec = el[el.index('==Teams=='):]; sec = sec[:8000]
clubs = []
for m in re.finditer(r'\{\{flagicon\|(\w+)\}\}\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', sec):
    art, short = m.group(2), (m.group(3) or m.group(2)).strip()
    if any(c['article'] == art for c in clubs): continue
    clubs.append({'country': m.group(1), 'article': art, 'name': short})
STRENGTH = {'Fenerbahçe': 5, 'Olympiacos': 5, 'Panathinaikos': 5, 'Real Madrid': 5, 'Barcelona': 4, 'Žalgiris': 4, 'Valencia Basket': 4, 'Hapoel Tel Aviv': 4,
            'Anadolu Efes': 3, 'Crvena zvezda': 3, 'Maccabi Tel Aviv': 3, 'Dubai Basketball': 3, 'Partizan': 3, 'Bayern Munich': 3, 'Olimpia Milano': 3,
            'Virtus Bologna': 3, 'Paris Basketball': 3, 'Baskonia': 2, 'ASVEL': 2, 'Beşiktaş': 2}
STARS = {'Aleksandar Vezenkov': 9, 'Kendrick Nunn': 8, 'Vasilije Micić': 8, 'Nikola Mirotić': 8, 'Mike James': 7, 'Shane Larkin': 7, 'Facundo Campazzo': 6,
         'Edy Tavares': 6, 'Mathias Lessort': 6, 'Nigel Hayes-Davis': 6, 'Wade Baldwin IV': 5, 'Elijah Bryant': 6, 'Carlik Jones': 6, 'Jean Montero': 5,
         'Evan Fournier': 5, 'Mario Hezonja': 6, 'Kostas Sloukas': 4, 'Tornike Shengelia': 4, 'Thomas Walkup': 4, 'Sylvain Francisco': 5, 'Kevin Punter': 5,
         'Džanan Musa': 6, 'Lorenzo Brown': 4, 'Nick Calathes': 3, 'Sertaç Şanlı': 3, 'TJ Shorts': 5, 'T. J. Shorts': 5, 'Lonnie Walker IV': 5, 'Antonio Blakeney': 4,
         'Zach LeDay': 4, 'Tyler Dorsey': 4, 'Marius Grigonis': 4, 'Sylvain Francisco ': 5, 'Juancho Hernangómez': 3, 'Willy Hernangómez': 4, 'Nikola Milutinov': 4,
         'Kendrick Perry': 3, 'Tyson Carter': 3, 'Nicolò Melli': 3, 'Shabazz Napier': 4, 'Theo Maledon': 4, 'Théo Maledon': 4, 'Nadir Hifi': 4, 'Darius Thompson': 3,
         'Codi Miller-McIntyre': 4, 'Dwayne Bacon': 4, 'Andrew Andrews': 3, 'Jaron Blossomgame': 3, 'Juan Núñez': 3, 'Jan Veselý': 3, 'Tomáš Satoranský': 4,
         'Chima Moneke': 4, 'Markus Howard': 4, 'Isaiah Canaan': 2, 'Will Clyburn': 4, 'Rokas Jokubaitis': 4, 'Sasha Vezenkov': 9, 'Saben Lee': 4, 'Tyrique Jones': 3}
COLORS = {'Barcelona': ['#a50044', '#004d98'], 'Olympiacos': ['#d51f26', '#ffffff'], 'Fenerbahçe': ['#0c2340', '#f5d40f'], 'Maccabi Tel Aviv': ['#ffd200', '#0033a0'],
          'Baskonia': ['#00205b', '#b0191e'], 'Panathinaikos': ['#007a3d', '#ffffff'], 'ASVEL': ['#111111', '#00a3e0'], 'Olimpia Milano': ['#d50032', '#ffffff'],
          'Real Madrid': ['#ffffff', '#5b2c83'], 'Anadolu Efes': ['#003b7d', '#e4002b'], 'Bayern Munich': ['#dc052d', '#0066b2'], 'Žalgiris': ['#006a44', '#ffffff'],
          'Valencia Basket': ['#f68b1f', '#111111'], 'Crvena zvezda': ['#d1132a', '#ffffff'], 'Beşiktaş': ['#111111', '#ffffff'], 'Hapoel Tel Aviv': ['#e30613', '#111111'],
          'Dubai Basketball': ['#1d1d1b', '#c8a24a'], 'Partizan': ['#111111', '#ffffff'], 'Paris Basketball': ['#14213d', '#e63946'], 'Virtus Bologna': ['#111111', '#ffffff']}
ABBR = {'Barcelona': 'BAR', 'Olympiacos': 'OLY', 'Fenerbahçe': 'FEN', 'Maccabi Tel Aviv': 'MTA', 'Baskonia': 'BKN', 'Panathinaikos': 'PAO', 'ASVEL': 'ASV', 'Olimpia Milano': 'MIL',
        'Real Madrid': 'RMB', 'Anadolu Efes': 'EFS', 'Bayern Munich': 'BAY', 'Žalgiris': 'ZAL', 'Valencia Basket': 'VAL', 'Crvena zvezda': 'CZV', 'Beşiktaş': 'BJK',
        'Hapoel Tel Aviv': 'HTA', 'Dubai Basketball': 'DUB', 'Partizan': 'PAR', 'Paris Basketball': 'PRS', 'Virtus Bologna': 'VIR'}
CITY = {'Barcelona': 'Barcelona', 'Olympiacos': 'Piraeus', 'Fenerbahçe': 'Istanbul', 'Maccabi Tel Aviv': 'Tel Aviv', 'Baskonia': 'Vitoria-Gasteiz', 'Panathinaikos': 'Athens',
        'ASVEL': 'Villeurbanne', 'Olimpia Milano': 'Milan', 'Real Madrid': 'Madrid', 'Anadolu Efes': 'Istanbul', 'Bayern Munich': 'Munich', 'Žalgiris': 'Kaunas',
        'Valencia Basket': 'Valencia', 'Crvena zvezda': 'Belgrade', 'Beşiktaş': 'Istanbul', 'Hapoel Tel Aviv': 'Tel Aviv', 'Dubai Basketball': 'Dubai', 'Partizan': 'Belgrade',
        'Paris Basketball': 'Paris', 'Virtus Bologna': 'Bologna'}

def h01(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xffffffff
def age_adj(a): return -4 if a < 21 else -2 if a < 24 else 1 if a <= 31 else -1 if a <= 34 else -3

def el_roster(c):
    title, t = follow_redirect(c['article'], raw(c['article']))
    m = re.search(r'\{\{#section:([^|}]+)\|roster\}\}', t)
    src = ''
    if m:
        st = raw(m.group(1).strip())
        a = st.find('<section begin=roster'); a = a if a >= 0 else st.find('<section begin="roster"')
        b = st.find('<section end', a + 10)
        src = st[a:b] if a >= 0 and b > a else st
    if not src or not players_in(src):
        for mm in re.finditer(r'\{\{([^{}|]*?(?:current )?roster)\}\}', t):
            tt = raw('Template:' + mm.group(1).strip())
            if players_in(tt): src = tt; break
    def block(x):
        a = x.find('roster header')
        if a < 0: return ''
        b = x.find('roster footer', a); b = x.find('}}', x.find('accessdate', b) if x.find('accessdate', b) > 0 else b) if b > 0 else a + 6000
        return x[a:b + 2]
    if not src or not players_in(src):
        bl = block(t)
        if players_in(bl): src = bl
    if not src or not players_in(src):
        for cand in ['2026–27 ' + title + ' season', '2026–27 ' + c['article'] + ' season']:
            st = raw(cand); bl = block(st)
            if players_in(bl): src = bl; break
    if not src or not players_in(src):
        for mm in re.finditer(r'\{\{([^{}|]*?(?:current )?roster)\}\}', t):
            tt = raw('Template:' + mm.group(1).strip()); tt = follow_redirect('Template:' + mm.group(1).strip(), tt)[1]
            if players_in(tt): src = tt; break
    return players_in(src), head_coach(src)

out_el = []
for c in clubs:
    pl, coach = el_roster(c)
    s = STRENGTH.get(c['name'], 3); rows = []
    for p in pl:
        star = STARS.get(p['name'], 0)
        ovr = round(min(84, max(55, 61 + 2.0 * s + age_adj(p['age']) + star + (h01(p['name']) - 0.5) * 6)))
        rows.append([p['name'], p['pos'], p['age'], ovr, p['nat'], p['ht'] or 0])
    rows.sort(key=lambda r: -r[3])
    out_el.append({'name': c['name'], 'abbr': ABBR.get(c['name'], c['name'][:3].upper()), 'city': CITY.get(c['name'], ''), 'country': c['country'], 'strength': s, 'coach': coach, 'colors': COLORS.get(c['name'], ['#333333', '#ffffff']), 'players': rows})
    print('EL', c['name'], len(rows), coach, file=sys.stderr)

# ---------------------------------------------------------------- G League
gl = raw('NBA G League')
gteams = []
for tbl in re.finditer(r'\{\| class="wikitable sortable sticky-header"(.*?)\n\|\}', gl, re.S):
    body = tbl.group(1); conf = 'East' if 'Eastern' in body[:300] else 'West'
    rows = body.split('\n|-')
    for r in rows:
        m = re.search(r'!\s*scope="row"\s*\|\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', r)
        if not m: continue
        name = (m.group(2) or m.group(1)).strip()
        rest = r[m.end():]
        cells = [x.strip() for x in re.split(r'\|\||\n\|', re.sub(r'<ref[^>]*?/>|<ref.*?</ref>', '', rest, flags=re.S)) if x.strip()]
        city = strip_links(cells[0]) if cells else ''
        aff = re.findall(r'\[\[([^\]|]+)(?:\|[^\]]+)?\]\]', rest)
        parent = next((a for a in reversed(aff) if any(a.endswith(n) for n in ['Hawks', 'Celtics', 'Nets', 'Hornets', 'Bulls', 'Cavaliers', 'Mavericks', 'Nuggets', 'Pistons', 'Warriors', 'Rockets', 'Pacers', 'Clippers', 'Lakers', 'Grizzlies', 'Heat', 'Bucks', 'Timberwolves', 'Pelicans', 'Knicks', 'Thunder', 'Magic', '76ers', 'Suns', 'Trail Blazers', 'Kings', 'Spurs', 'Raptors', 'Jazz', 'Wizards'])), '')
        gteams.append({'name': name, 'article': m.group(1).strip(), 'city': city.split(',')[0], 'conf': conf, 'parent': parent.split(' ')[-1] if parent and not parent.endswith('Trail Blazers') else ('Trail Blazers' if parent else '')})
out_gl = []
for t in gteams:
    tt = raw('Template:' + t['article'] + ' roster')
    pl = players_in(tt); coach = head_coach(tt); rows = []
    for p in pl:
        bump = 4 if p['note'] == 'NBA' else 3 if p['note'] == 'TW' else 0
        ovr = round(min(72, max(50, 57 + bump + (1 if 22 <= p['age'] <= 28 else -1) + (h01(p['name']) - 0.5) * 6)))
        rows.append([p['name'], p['pos'], p['age'], ovr, p['note'] or '', p['ht'] or 0, p['college']])
    rows.sort(key=lambda r: -r[3])
    out_gl.append({'name': t['name'], 'city': t['city'], 'conf': t['conf'], 'parent': t['parent'], 'coach': coach, 'players': rows})
    print('GL', t['name'], t['parent'], len(rows), file=sys.stderr)

js = '(function (g) {\n  // GENERATED by scripts/build-euro.py from Wikipedia (2026-27 EuroLeague clubs and rosters; NBA G League clubs and latest roster snapshots).\n  // Ratings are a heuristic on the NBA OVR scale (club strength, age, role, a short list of known EuroLeague stars), not measured.\n'
js += '  // EuroLeague row: [name, pos, age, ovr, nationality, height in]; G League row: [name, pos, age, ovr, note (TW two-way / NBA on assignment), height in, college]\n'
js += '  (g.NBA = g.NBA || {}).EuroData = ' + json.dumps({'season': 2026, 'euroleague': out_el, 'gleague': out_gl}, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += "  if (typeof module !== 'undefined') module.exports = g.NBA;\n})(typeof window !== 'undefined' ? window : globalThis);\n"
open(os.path.join(os.path.dirname(__file__), '..', 'src', 'eurodata.js'), 'w', encoding='utf8').write(js)
print('EuroLeague clubs', len(out_el), 'players', sum(len(c['players']) for c in out_el), '| G League clubs', len(out_gl), 'players', sum(len(c['players']) for c in out_gl))
