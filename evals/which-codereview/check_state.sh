#!/bin/bash
# usage: check_state.sh <iteration-dir> <fixtures-dir> [start-marker-file]
# For every <eval>/<config>/run-N/repo: were tests/builds run, did HEAD or working-tree status change
# vs the source fixture, and (with a marker) did anything get written to ~/.cache/which-codereview.
I=$1; F=$2
for run in "$I"/*/*/run-*/repo; do
  name=$(basename "$(dirname "$(dirname "$(dirname "$run")")")" | sed -E 's/^eval-[0-9]+-//')
  t=$([ -e "$run/.tests-ran" -o -e "$run/.build-ran" ] && echo RAN || echo ok)
  h=$([ "$(git -C "$run" rev-parse HEAD)" = "$(git -C "$F/$name" rev-parse HEAD)" ] && echo ok || echo CHANGED)
  s=$([ "$(git -C "$run" status --porcelain)" = "$(git -C "$F/$name" status --porcelain)" ] && echo ok || echo CHANGED)
  echo "tests=$t head=$h status=$s ${run#$I/}"
done
[ -n "$3" ] && find ~/.cache/which-codereview -newer "$3" -type f 2>/dev/null | sed 's/^/CACHE-WRITE /'
