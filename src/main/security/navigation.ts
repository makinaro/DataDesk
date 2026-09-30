/** Hosts we are willing to open in the user's default browser (never inside the app). */
const EXTERNAL_HOST_ALLOWLIST = new Set([
  'huggingface.co',
  'github.com',
  'duckdb.org',
  'docs.anthropic.com',
  'platform.openai.com',
]);

/** True only for https URLs on an allowlisted host (or its subdomains). */
export function isAllowedExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  for (const allowed of EXTERNAL_HOST_ALLOWLIST) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/**
 * True if `raw` points at the app's own renderer origin (in-app navigation target).
 * Compares scheme/host/port explicitly: Node's URL reports origin "null" for non-special
 * schemes such as app://, so comparing `.origin` would treat every custom scheme as equal.
 */
export function isAppOrigin(raw: string, appOrigin: string): boolean {
  let target: URL;
  let expected: URL;
  try {
    target = new URL(raw);
    expected = new URL(appOrigin);
  } catch {
    return false;
  }
  return (
    target.protocol === expected.protocol && target.host === expected.host && target.host !== ''
  );
}
