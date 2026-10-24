#!/usr/bin/env bash
# Run the realism test on 4 cores: generate careers per archetype in parallel, then score them together.
# Usage: scripts/realism-run.sh [careers per archetype, default 150] [tag]   (TUNE='{...}' is passed through)
N=${1:-150}; TAG=${2:-run}; D=${DUMPDIR:-$(mktemp -d)}; mkdir -p "$D"
cd "$(dirname "$0")/.."
ARCHS=generational NGEN=$((N * 2 / 3)) DUMP=$D/a.json node scripts/realism-test.js $N > /dev/null &
ARCHS=scorer DUMP=$D/b.json node scripts/realism-test.js $N > /dev/null &
ARCHS=shooter DUMP=$D/c.json node scripts/realism-test.js $N > /dev/null &
ARCHS=twoway DUMP=$D/e.json node scripts/realism-test.js $((N * 3)) > /dev/null &
ARCHS=dominator,defender DUMP=$D/d.json node scripts/realism-test.js $N > /dev/null &
wait
LOAD=$D/a.json,$D/b.json,$D/c.json,$D/d.json,$D/e.json JSON=${JSON:-/dev/null} node scripts/realism-test.js
