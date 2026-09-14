import {createMwfServerRuntime} from '@/lib/mwfServerRuntime'
import {createMwfHttpHandlers} from '@/lib/mwfServerAuthority.mjs'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=300
// Canonical GitHub request is the authority. HTTP only wakes/reads that request;
// caller body, URLs and publication decisions are never accepted.
const handlers=createMwfHttpHandlers(createMwfServerRuntime)
export const POST=handlers.POST
export const GET=handlers.GET
