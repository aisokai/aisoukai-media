// Pure gate shared by the isolated live CLI and ordinary tests. No env or network access.
export const EXPLICIT_SEND_FLAG = '--send'
export const HUMAN_APPROVAL_FLAG = '--human-approved'

export function hasExplicitHumanGate(argv = []) {
  return argv.includes(EXPLICIT_SEND_FLAG) && argv.includes(HUMAN_APPROVAL_FLAG)
}
