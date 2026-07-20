import { spawnSync } from 'node:child_process'
import { NORMAL_TEST_FILES } from './safe-test-manifest.mjs'

const result = spawnSync(process.execPath, ['--test', ...NORMAL_TEST_FILES], { stdio: 'inherit', env: process.env })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
