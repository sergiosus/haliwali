/** Format admin offer-search API errors for JSON responses. */

export type OfferSearchApiErrorDetail = {
  message: string;
  httpStatus?: number;
  source?: string;
  requestUrl?: string;
  stack?: string;
  file?: string;
  line?: number;
};

function parseStackFrame(stack: string | undefined): { file?: string; line?: number } {
  if (!stack) return {};
  const line = stack.split("\n").find((l) => l.includes("at ") && !l.includes("node_modules"));
  if (!line) return {};
  const m = line.match(/\((.+):(\d+):(\d+)\)/) ?? line.match(/at (.+):(\d+):(\d+)/);
  if (!m) return {};
  return { file: m[1], line: Number(m[2]) };
}

export function formatOfferSearchApiError(
  err: unknown,
  opts?: { httpStatus?: number; source?: string; requestUrl?: string; includeStack?: boolean },
): OfferSearchApiErrorDetail {
  const e = err instanceof Error ? err : new Error(String(err));
  const showStack =
    opts?.includeStack === true || process.env.NODE_ENV !== "production";
  const frame = showStack ? parseStackFrame(e.stack) : {};
  return {
    message: e.message || "Unknown search error",
    httpStatus: opts?.httpStatus,
    source: opts?.source,
    requestUrl: opts?.requestUrl,
    stack: showStack ? e.stack : undefined,
    file: frame.file,
    line: frame.line,
  };
}
