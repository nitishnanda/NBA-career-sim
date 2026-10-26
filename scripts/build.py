# Bundles style.css + src/shell.html + src/*.js into one self-contained page: python3 scripts/build.py
shell = open('src/shell.html').read()
css = open('style.css').read()
js = "\n".join(open(f'src/{n}.js').read() for n in ['data', 'logos', 'engine', 'league', 'real', 'sizes', 'combine', 'decisions', 'game', 'ui'])
assert '</script' not in js
open('dist/nba-career-sim.html', 'w').write(shell.replace('/*CSS*/', css).replace('/*JS*/', js))
# standalone page for GitHub Pages / phones: needs its own doctype + viewport (the artifact viewer supplies these itself)
head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Cache-Control" content="no-cache, must-revalidate">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#f5ede0" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#1e1914" media="(prefers-color-scheme: dark)">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="NBA Career Sim">\n'
body = shell.replace('/*CSS*/', css).replace('/*JS*/', js)
i = body.index('<header')
open('dist/index.html', 'w').write(head + body[:i] + '</head>\n<body>\n' + body[i:] + '</body>\n</html>\n')
