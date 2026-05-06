/**
 * Gate verbose authentication / session diagnostics.
 * Server: DEBUG_AUTH=true
 * Browser console: NEXT_PUBLIC_DEBUG_AUTH=true (matches server flag in dev typically)
 */
export function isDebugAuthServer(): boolean {
  return process.env.DEBUG_AUTH === "true";
}

/** Use in `"use client"` modules; must be prefixed for Next bundler inlining. */
export function isDebugAuthClient(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";
}
