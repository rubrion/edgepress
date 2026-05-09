// Origin allowlisting + CORS header helpers shared by public widget endpoints
// (`/api/subscribe`, `/api/unsubscribe`, etc).
//
// `widgetAllowedOrigins` is a comma-separated list. The literal `*` allows any
// origin. Empty/unset means "same-origin only" (no CORS headers emitted).

const STAR = '*';

export type AllowOriginResult = {
  // Value to send as `Access-Control-Allow-Origin`. `null` means do not emit
  // CORS headers (block cross-origin reads; same-origin still works).
  allowOrigin: string | null;
  // True when the wildcard `*` matched. Cannot be combined with credentials.
  isWildcard: boolean;
};

export const matchAllowedOrigin = (
  requestOrigin: string | null,
  setting: string | undefined,
): AllowOriginResult => {
  if (!requestOrigin) return { allowOrigin: null, isWildcard: false };
  const list = (setting ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return { allowOrigin: null, isWildcard: false };
  if (list.includes(STAR)) return { allowOrigin: STAR, isWildcard: true };
  if (list.includes(requestOrigin)) return { allowOrigin: requestOrigin, isWildcard: false };
  return { allowOrigin: null, isWildcard: false };
};

export const corsHeaders = (
  match: AllowOriginResult,
  methods: string[] = ['POST', 'OPTIONS'],
): Record<string, string> => {
  if (!match.allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': match.allowOrigin,
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};
