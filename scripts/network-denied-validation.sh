#!/bin/sh
# Safe validation proof: outbound networking is denied by the parent sandbox.
# No live-send flags are ever supplied, and no dotenv file is read here.
set -eu

if [ "${NETWORK_DENIED_ACTIVE:-}" != "1" ]; then
  if ! command -v sandbox-exec >/dev/null 2>&1; then
    echo 'HUMAN_GATE_REQUIRED: sandbox-exec is required for safe validation' >&2
    exit 1
  fi
  project_root=$(pwd -P)
  profile="(version 1) (allow default) (deny network*) (deny file-read-data (literal \"${project_root}/.env.local\"))"
  exec env NETWORK_DENIED_ACTIVE=1 NEXT_PUBLIC_SITE_URL='https://safe-validation.invalid' sandbox-exec -p "$profile" sh "$0"
fi

node scripts/validate-safe-test-path.mjs
node scripts/run-safe-tests.mjs
npm run lint
npx next build --webpack
npm run validate:posts

echo 'network-denied-validation: PASS (externalSendObserved=0 within this sandboxed run)'
