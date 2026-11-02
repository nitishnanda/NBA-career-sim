#!/usr/bin/env python3
"""Cache every NBA roster template from Wikipedia (name, position, birthday, height, weight, two-way flag) to data/sources/wiki-rosters.json.
Used by scripts/build-real.py for ages and sizes. Usage: python3 scripts/fetch-wiki-rosters.py"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location('rr', os.path.join(os.path.dirname(__file__), 'refresh-rosters.py')); rr = importlib.util.module_from_spec(spec); spec.loader.exec_module(rr)
out = {}
for nick, full in rr.TEAMS.items():
    t = rr.raw('Template:%s roster' % full); ps = []
    for m in re.finditer(r"\{\{player2?\s*\|(.*?)\}\}", t, flags=re.S):
        f = {}
        for part in m.group(1).split('|'):
            if '=' in part: k, v = part.split('=', 1); f[k.strip()] = v.strip()
        if not (f.get('first') and f.get('last')): continue
        ht = int(f['ft']) * 12 + int(f.get('in') or 0) if f.get('ft', '').isdigit() else None
        ps.append({'name': f['first'] + ' ' + f['last'], 'pos': f.get('pos', ''), 'dob': f.get('DOB'), 'ht': ht, 'wt': int(f['lbs']) if f.get('lbs', '').isdigit() else None, 'note': f.get('note', '')})
    out[nick] = ps; print(nick, len(ps)); time.sleep(1.0)
json.dump({'asOf': time.strftime('%Y-%m-%d'), 'teams': out}, open(os.path.join(os.path.dirname(__file__), '..', 'data/sources/wiki-rosters.json'), 'w'), ensure_ascii=False, indent=0)
