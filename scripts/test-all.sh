#!/bin/bash
# The whole suite in one go: build, the logic checks (node), then the browser tests (they use the built page: DIST=1).
#   bash scripts/test-all.sh            everything except the slow old-save check
#   bash scripts/test-all.sh --saves    also load old saves from older versions (needs /tmp/oldv, see scripts/save-compat.js)
cd "$(dirname "$0")/.." || exit 1
python3 scripts/build.py > /dev/null || { echo "build failed"; exit 1; }
fail=0; run() { local name="$1"; shift; local out; out=$("$@" 2>&1 | tail -1); if echo "$out" | grep -qiE "OK|errors: none|all [0-9]+ (old saves|phone)"; then echo "ok    $name"; else echo "FAIL  $name :: ${out:0:140}"; fail=$((fail+1)); fi; }
for c in simgo-check live-check core-check arc-check world-check story-check mention-check injury2-check press-check allstar-check family-check hs-check intl-check gl-check; do run "$c" node scripts/$c.js; done
for t in ui-test ui-live ui-core ui-press ui-ai ui-allstar ui-market ui-report ui-intl ui-gl ui-euro; do run "$t" env DIST=1 node scripts/$t.js; done
run ui-bracket node scripts/ui-bracket.js
run ui-phone node scripts/ui-phone.js
[ "$1" = "--saves" ] && run save-compat node scripts/save-compat.js
git checkout -q -- undefined/ 2>/dev/null   # the screenshot folder the browser tests write into
[ $fail -eq 0 ] && echo "ALL GREEN" || echo "$fail suite(s) failed"; exit $fail
