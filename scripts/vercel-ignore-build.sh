#!/usr/bin/env bash
# Vercel "Ignored Build Step" (master_plan §2BO, cost diagnosis fix #2).
#
# Vercel runs this before every build:  exit 0 = SKIP the build,  exit 1 = BUILD.
#
# Skips a deployment only when EVERYTHING changed since the last successful deployment of this branch is
# documentation or working material (Markdown, docs/, working/, SQL apply scripts). It compares against
# VERCEL_GIT_PREVIOUS_SHA (the last successful deployment), NOT HEAD^: a push of "code commit + docs commit"
# must still build, because the code commit is in the range.
#
# Fail-safe: any doubt (no previous SHA, SHA not fetchable, git error) → BUILD.
#
# Local test:  VERCEL_GIT_PREVIOUS_SHA=<sha> VERCEL_IGNORE_TEST_HEAD=<sha> bash scripts/vercel-ignore-build.sh

set -u

HEAD_REF="${VERCEL_IGNORE_TEST_HEAD:-HEAD}"
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$PREV" ]; then
  echo "vercel-ignore-build: no previous deployment SHA - building."
  exit 1
fi

# Vercel clones shallowly; make sure the previous deployment's commit is available.
if ! git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$PREV" 2>/dev/null || true
fi
if ! git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  echo "vercel-ignore-build: previous SHA ${PREV} not available - building."
  exit 1
fi

CHANGED="$(git diff --name-only "$PREV" "$HEAD_REF" 2>/dev/null)" || {
  echo "vercel-ignore-build: git diff failed - building."
  exit 1
}

if [ -z "$CHANGED" ]; then
  echo "vercel-ignore-build: no file changes since ${PREV} - skipping build."
  exit 0
fi

# Anything that is NOT documentation / working material means we must build.
NON_DOC="$(printf '%s\n' "$CHANGED" | grep -Ev '(\.md$|^docs/|^working/|^scripts/apply-[0-9]+\.sql$)' || true)"

if [ -z "$NON_DOC" ]; then
  echo "vercel-ignore-build: only docs changed since ${PREV} - skipping build:"
  printf '%s\n' "$CHANGED" | sed 's/^/  /'
  exit 0
fi

echo "vercel-ignore-build: app files changed since ${PREV} - building."
exit 1
