#!/usr/bin/env node
// The server authority migration covers scheduled normal drafts only.
// Fail before inspecting arguments, environment, proposals, or existing articles.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export async function runMinorEdit() {
  throw Error('minor_server_authority_not_supported')
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.error('minor_server_authority_not_supported')
  process.exitCode=1
}
