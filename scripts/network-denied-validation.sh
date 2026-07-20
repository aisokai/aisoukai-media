#!/bin/sh
# Safe validation proof: outbound networking is denied by the parent sandbox.
# No live-send flags are ever supplied, and no dotenv file is read here.
set -eu

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
