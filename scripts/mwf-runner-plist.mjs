#!/usr/bin/env node
// Generates only non-secret job configuration. Does not install/start any job.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export function mwfRunnerPlist(commit) {
  if(!/^[a-f0-9]{40}$/.test(commit??''))throw Error('reviewed_commit_required')
  const root='/Users/caelus/Library/Application Support/AisoukaiMWF'
  const release=`${root}/releases/${commit}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.mitani.aisoukai-media-ops-mwf</string>
<key>ProgramArguments</key><array><string>/opt/homebrew/bin/node</string><string>--env-file=/Users/caelus/projects/aisoukai-media/.env.local</string><string>--env-file=${root}/runtime-metadata.env</string><string>${release}/scripts/ops-mwf.mjs</string><string>--production</string></array>
<key>EnvironmentVariables</key><dict><key>MWF_RUNNER_VERSION</key><string>${commit}</string></dict>
<key>WorkingDirectory</key><string>${release}</string>
<key>StartCalendarInterval</key><array>${[1,3,5].map(day=>`<dict><key>Weekday</key><integer>${day}</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>`).join('')}</array>
<key>StandardOutPath</key><string>${root}/state/runner.log</string>
<key>StandardErrorPath</key><string>${root}/state/runner-error.log</string>
</dict></plist>\n`
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)throw Error('commit_required');process.stdout.write(mwfRunnerPlist(process.argv[2]))}catch{console.error('invalid_runner_configuration');process.exitCode=1}
}
