import https from "https";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Outbound HTTPS through a forward proxy, for hosts that cannot reach the internet
 * directly (the production VM goes out through proxy.serviziaria-enti.local:8080).
 *
 *   OUTBOUND_PROXY   http://host:port, or http://user:password@host:port
 *
 * Empty = direct connections, as before. Only HTTPS goes through the proxy: the
 * external calls (CAT, Teams webhook, external file downloads) are all HTTPS,
 * while Keycloak is reached over plain HTTP inside the Docker network and must
 * not leave it. SMTP and Postgres are not HTTP and are not affected.
 *
 * The agent replaces https.globalAgent, which axios uses when a request sets no
 * agent of its own. axios' built-in proxy support is switched off: for HTTPS
 * targets it does not tunnel with CONNECT, and it would also pick up stray
 * HTTPS_PROXY variables and bypass this agent.
 *
 * Imported first in server.ts, so that it is in place before any request.
 */
const proxy = process.env.OUTBOUND_PROXY?.trim();

if (proxy) {
  const url = new URL(proxy);
  https.globalAgent = new HttpsProxyAgent(url, { keepAlive: true });
  axios.defaults.proxy = false;
  console.log(`🌐 Outbound HTTPS via proxy ${url.host}`);
}
