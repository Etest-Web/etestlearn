#!/usr/bin/env bash
# Integration gate — run once, by the integrator, after every sweep branch has
# landed. Not by subagents: a Next build is ~3 min and ~2GB RAM, and running
# several concurrently causes Turbopack cache contention that shows up as a
# bogus build failure in whichever agent lost the race.
#
# Subagents run `tsc --noEmit` only. This is the single place the build happens.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

# CI injects these so `next build` can prerender. Never use real values here.
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
export NEXT_PUBLIC_CONVEX_URL=https://placeholder.convex.cloud
export NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_placeholder

fail=0
step() {
  local name=$1
  shift
  printf '\n───── %s ─────\n' "$name"
  if "$@"; then
    printf '✓ %s\n' "$name"
  else
    printf '✗ %s\n' "$name"
    fail=1
  fi
}

step "typecheck"  ./node_modules/.bin/tsc --noEmit
step "tests"      ./node_modules/.bin/vitest run --reporter=dot
step "build"      ./node_modules/.bin/next build

# A registered token is not the same as a utility that emits CSS: `--success`
# sat in `:root` un-mapped and `--elevation-*` was not a Tailwind namespace, so
# several classes typechecked and rendered nothing. Cheap to check, and it is the
# class of defect nothing else in this repo catches.
step "utility emission" node scripts/check-utilities.mjs

printf '\n───── residue ─────\n'
# Hardcoded brand hex and the old 24px radius are the two tells that made the
# codebase read as assembled rather than designed. Both should be gone from
# app/ and components/ once the sweep is complete.
#
# Two exclusions, because a gate that reports known-good lines gets ignored:
#   · comment/prose lines, which legitimately *mention* these strings when
#     explaining why they are gone (card.tsx documents the removed override);
#   · the theme-color meta tag, which cannot take a CSS variable — a literal hex
#     is the only thing that works there.
usage_only() {
  grep -vE '(^|[[:space:]])(//|\*|/\*)' "$1" |
    grep -v 'name="theme-color"'
}

residue=$(usage_only "$(grep -rln '945DA3\|rounded-\[24px\]' app components --include='*.tsx' 2>/dev/null)" | wc -l)
echo "hardcoded #945DA3 / rounded-[24px] remaining: $residue"

# The Base UI tab trap: `data-[state=active]:` is Radix's attribute and silently
# matches nothing on these primitives. Prose mentioning the trap is fine — it
# is a usage site that matters.
radix=$(grep -rn 'data-\[state=active\]:' app components --include='*.tsx' 2>/dev/null | wc -l)
echo "dead Radix data-[state=active:] selectors:  $radix"

if [ "$residue" -ne 0 ]; then
  echo
  usage_only "$(grep -rln '945DA3\|rounded-\[24px\]' app components --include='*.tsx' 2>/dev/null)" | head -20
fi

if [ "$residue" -ne 0 ] || [ "$radix" -ne 0 ]; then
  fail=1
  printf '\nresidue found — see counts above\n'
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  echo "GATE PASSED"
else
  echo "GATE FAILED"
fi
exit "$fail"