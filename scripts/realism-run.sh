#!/usr/bin/env bash
# Run the realism test on all cores: careers are generated in chunks of 100 per archetype in parallel, then scored together.
# Usage: scripts/realism-run.sh [careers per archetype, default 150] [parallel jobs, default nproc]   (TUNE='{...}' is passed through; DUMPDIR keeps the dumps)
# Generational gets 2/3 of N (they all qualify), two-way 3x N (few two-way careers become notable two-way players).
N=${1:-150}; P=${2:-$(nproc)}; D=${DUMPDIR:-$(mktemp -d)}; mkdir -p "$D"
cd "$(dirname "$0")/.."
jobs() {
  for spec in "generational $((N * 2 / 3))" "scorer $N" "shooter $N" "twoway $((N * 3))" "dominator $N" "defender $N"; do
    set -- $spec; a=$1; n=$2
    for ((i = 0; i < n; i += 100)); do c=$(( n - i < 100 ? n - i : 100 )); echo "$a $i $c"; done
  done
}
jobs | xargs -P "$P" -L 1 sh -c 'ARCHS=$0 I0=$1 NGEN=$2 DUMP='"$D"'/$0-$1.json node scripts/realism-test.js $2 > /dev/null'
LOAD=$(ls "$D"/*.json | paste -sd, -) JSON=${JSON:-/dev/null} node scripts/realism-test.js
