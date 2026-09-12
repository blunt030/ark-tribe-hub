const DEFAULT_STUN = { urls: ['stun:stun.cloudflare.com:3478'] };
const credentialCache = new Map();

function urlsOf(server) {
  if (!server) return [];
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}

export function hasTurnServer(servers = []) {
  return servers.some((server) => urlsOf(server).some((url) => /^turns?:/i.test(String(url))));
}

export function clearTurnCredentialCache() {
  credentialCache.clear();
}

/**
 * Liefert nur kurzlebige Browser-Credentials aus. Der langfristige TURN-Key
 * bleibt ausschließlich als Render-Secret auf dem Server. Pro Benutzer wird
 * höchstens ein Credential-Satz bis kurz vor Ablauf wiederverwendet.
 */
export async function resolveVoiceIceConfig(settings, userId, fetchImpl = globalThis.fetch) {
  const fallback = Array.isArray(settings.rtcIceServers) && settings.rtcIceServers.length
    ? settings.rtcIceServers
    : [DEFAULT_STUN];
  const baseResult = { iceServers: fallback, turnConfigured: hasTurnServer(fallback) };
  const keyId = settings.cloudflareTurn?.keyId;
  const keySecret = settings.cloudflareTurn?.keySecret;
  if (!keyId || !keySecret || typeof fetchImpl !== 'function') return baseResult;

  const ttlSeconds = Math.min(172800, Math.max(300, Number(settings.cloudflareTurn.ttlSeconds) || 3600));
  const refreshLeadSeconds = Math.min(300, Math.max(30, Math.floor(ttlSeconds * 0.15)));
  const cacheKey = String(userId || 'anonymous');
  const now = Date.now();
  const cached = credentialCache.get(cacheKey);
  if (cached && cached.expiresAtMs - refreshLeadSeconds * 1000 > now) return cached.result;

  for (const [id, entry] of credentialCache) {
    if (entry.expiresAtMs <= now) credentialCache.delete(id);
  }

  try {
    const response = await fetchImpl(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${keySecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: ttlSeconds }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) throw new Error(`Cloudflare antwortet mit HTTP ${response.status}`);
    const payload = await response.json();
    // Cloudflare liefert aktuell ein RTCIceServer-Array. Die fruehere API-Antwort
    // enthielt an derselben Stelle ein einzelnes Objekt; beides bleibt lesbar,
    // damit ein gestaffeltes Rollout keine laufenden Voice-Sessions bricht.
    const suppliedServers = Array.isArray(payload?.iceServers)
      ? payload.iceServers
      : [payload?.iceServers].filter(Boolean);
    const supplied = suppliedServers.find((server) => (
      urlsOf(server).some((url) => /^turns?:/i.test(String(url)))
      && server?.username
      && server?.credential
    ));
    const turnUrls = urlsOf(supplied)
      .map(String)
      .filter((url) => /^turns?:/i.test(url) && !/:53(?:\?|$)/.test(url));
    if (!turnUrls.length || !supplied?.username || !supplied?.credential) {
      throw new Error('Cloudflare hat keine vollständigen TURN-Credentials geliefert');
    }

    const expiresAtMs = now + ttlSeconds * 1000;
    const result = {
      iceServers: [
        DEFAULT_STUN,
        {
          urls: turnUrls,
          username: supplied.username,
          credential: supplied.credential,
          credentialType: 'password',
        },
      ],
      turnConfigured: true,
      credentialExpiresAt: new Date(expiresAtMs).toISOString(),
      refreshAfterSeconds: ttlSeconds - refreshLeadSeconds,
    };
    credentialCache.set(cacheKey, { result, expiresAtMs });
    return result;
  } catch (error) {
    console.error(`[VOICE] Kurzlebige Cloudflare-TURN-Credentials konnten nicht geladen werden: ${error.message}`);
    return baseResult;
  }
}
