#!/bin/bash
# usage: check_state.sh <iteration-dir> <fixtures-dir>
# For every <eval>/<config>/run-N/repo: did the router run tests/builds/audits or a repo-local binary,
# and did HEAD or working-tree status change vs the source fixture.
I=$1; F=$2
for run in "$I"/*/*/run-*/repo; do
  name=$(basename "$(dirname "$(dirname "$(dirname "$run")")")" | sed -E 's/^eval-[0-9]+-//')
  ran=""
  for m in tests build audit bin; do [ -e "$run/.$m-ran" ] && ran="$ran$m,"; done
  t=${ran:-ok}
  h=$([ "$(git -C "$run" rev-parse HEAD)" = "$(git -C "$F/$name" rev-parse HEAD)" ] && echo ok || echo CHANGED)
  s=$([ "$(git -C "$run" status --porcelain)" = "$(git -C "$F/$name" status --porcelain)" ] && echo ok || echo CHANGED)
  echo "executed=$t head=$h status=$s ${run#$I/}"
done
