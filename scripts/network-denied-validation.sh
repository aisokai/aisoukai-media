#!/bin/sh
# Safe validation proof: outbound networking is denied by the parent sandbox.
# No live-send flags are ever supplied, and no dotenv file is read here.
set -eu

if [ "${NETWORK_DENIED_ACTIVE:-}" != "1" ]; then
  project_root=$(pwd -P)
  profile="(version 1) (allow default) (deny network*) (allow network* (local ip \"localhost:*\")) (allow network* (remote ip \"localhost:*\")) (deny file-read-data (literal \"${project_root}/.env.local\"))"
  exec env NETWORK_DENIED_ACTIVE=1 NEXT_PUBLIC_SITE_URL='https://safe-validation.invalid' sandbox-exec -p "$profile" sh "$0"
fi

npm run validate:safe-test-path
npm test
npm run lint
npm run build
npm run validate:posts

if env -i PATH="$PATH" node scripts/telegram-notify-live-check.mjs; then
  echo 'UNSAFE: live CLI unexpectedly succeeded without the Human Gate' >&2
  exit 1
fi

echo 'network-denied-validation: PASS (externalSendCount=0)'
