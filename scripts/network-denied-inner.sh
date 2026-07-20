#!/bin/sh
# Invoked only by network-denied-launcher.sh inside its strict sandbox.
set -eu
node scripts/validate-safe-test-path.mjs
node scripts/run-safe-tests.mjs
npm run lint
npx next build --webpack
npm run validate:posts
echo 'network-denied-validation: PASS (externalSendObserved=0 within this sandboxed run)'
