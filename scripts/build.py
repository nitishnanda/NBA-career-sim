# Bundles style.css + src/shell.html + src/*.js into one self-contained page: python3 scripts/build.py
shell = open('src/shell.html').read()
css = open('style.css').read()
js = "\n".join(open(f'src/{n}.js').read() for n in ['data', 'engine', 'league', 'real', 'game', 'ui'])
assert '</script' not in js
open('dist/nba-career-sim.html', 'w').write(shell.replace('/*CSS*/', css).replace('/*JS*/', js))
