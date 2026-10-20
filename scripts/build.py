# Bundles src/*.js + the dist CSS into one self-contained page: python3 scripts/build.py
import re
html = open('dist/nba-career-sim.html').read()
js = "\n".join(open(f'src/{n}.js').read() for n in ['data', 'engine', 'league', 'real', 'game', 'ui'])
assert '</script' not in js
start = html.index('<script>\n') + len('<script>\n')
end = html.rindex('</script>')
open('dist/nba-career-sim.html', 'w').write(html[:start] + js + "\n" + html[end:])
