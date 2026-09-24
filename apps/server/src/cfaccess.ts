import crypto from 'node:crypto';

// Cloudflare Access: verify `Cf-Access-Jwt-Assertion` (RS256) against the team's JWKS.
// Used *in addition to* the Cayrnx password for requests arriving on the configured hostnames.

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let cache: { team: string; at: number; keys: Jwk[] } | null = null;

async function jwks(teamDomain: string): Promise<Jwk[]> {
  const team = teamDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (cache && cache.team === team && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  cache = { team, at: Date.now(), keys: body.keys || [] };
  return cache.keys;
}

const b64 = (s: string) => Buffer.from(s, 'base64url');

export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<{ ok: boolean; reason?: string; email?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  let header: any;
  let payload: any;
  try {
    header = JSON.parse(b64(parts[0]).toString());
    payload = JSON.parse(b64(parts[1]).toString());
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg' };
  let keys: Jwk[];
  try {
    keys = await jwks(teamDomain);
  } catch (e: any) {
    return { ok: false, reason: e.message };
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown key' };
  const key = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
  if (!ok) return { ok: false, reason: 'signature' };
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - 30) return { ok: false, reason: 'expired' };
  const auds: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud && !auds.includes(aud)) return { ok: false, reason: 'audience' };
  const iss = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`;
  if (payload.iss && payload.iss !== iss) return { ok: false, reason: 'issuer' };
  return { ok: true, email: payload.email };
}
