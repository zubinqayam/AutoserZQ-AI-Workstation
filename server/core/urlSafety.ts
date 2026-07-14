import { promises as dns } from "dns";
import { isIP } from "net";

const MAX_REDIRECTS = 3;

const hasSuspiciousNumericHostname = (host: string) => {
  const normalized = host.toLowerCase();
  return (
    /^0x[0-9a-f]+$/.test(normalized) ||
    /^0[0-7]+(?:\.0[0-7]+){0,3}$/.test(normalized) ||
    /^\d+$/.test(normalized)
  );
};

const isLocalHostname = (host: string) => {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
};

const ipv4ToInt = (ip: string): number =>
  ip.split(".").map((octet) => Number.parseInt(octet, 10)).reduce((acc, part) => (acc << 8) + part, 0) >>> 0;

const inIpv4Range = (ip: string, cidrBase: string, cidrBits: number): boolean => {
  const ipNum = ipv4ToInt(ip);
  const baseNum = ipv4ToInt(cidrBase);
  const mask = cidrBits === 0 ? 0 : (0xffffffff << (32 - cidrBits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
};

const isBlockedIpv4 = (ip: string): boolean => {
  const blockedCidrs: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return blockedCidrs.some(([base, bits]) => inIpv4Range(ip, base, bits));
};

const isBlockedIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.")
  );
};

const isMetadataHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return (
    normalized === "169.254.169.254" ||
    normalized === "metadata.google.internal" ||
    normalized.endsWith(".metadata.google.internal") ||
    normalized === "metadata.azure.internal"
  );
};

export interface SafeFetchResult {
  url: URL;
  redirects: string[];
}

export async function validateOutboundUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http/https URLs are allowed.");
  if (parsed.username || parsed.password) throw new Error("Credentials in URLs are not allowed.");
  if (!parsed.hostname) throw new Error("Hostname is required.");
  if (hasSuspiciousNumericHostname(parsed.hostname)) throw new Error("Ambiguous numeric hostnames are not allowed.");
  if (isLocalHostname(parsed.hostname) || isMetadataHost(parsed.hostname)) throw new Error("Target host is not allowed.");

  await assertHostResolvesToPublicNetwork(parsed.hostname);
  return parsed;
}

export async function assertHostResolvesToPublicNetwork(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (isLocalHostname(host) || isMetadataHost(host) || hasSuspiciousNumericHostname(host)) throw new Error("Target host is not allowed.");
  const directIpFamily = isIP(host);
  if (directIpFamily === 4 && isBlockedIpv4(host)) throw new Error("Target host resolves to a blocked IPv4 range.");
  if (directIpFamily === 6 && isBlockedIpv6(host)) throw new Error("Target host resolves to a blocked IPv6 range.");
  if (directIpFamily) return;

  const answers = await dns.lookup(host, { all: true, verbatim: true });
  if (!answers.length) throw new Error("Unable to resolve hostname.");
  for (const entry of answers) {
    const addr = entry.address;
    if ((entry.family === 4 && isBlockedIpv4(addr)) || (entry.family === 6 && isBlockedIpv6(addr))) {
      throw new Error("Target host resolves to a blocked network destination.");
    }
  }
}

export async function fetchWithRedirectValidation(
  initialUrl: URL,
  opts: { timeoutMs: number; maxBytes: number; userAgent: string }
): Promise<{ response: Response; finalUrl: URL; redirects: string[] }> {
  let currentUrl = initialUrl;
  const redirects: string[] = [];

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const safeCurrentUrl = await validateOutboundUrl(currentUrl.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    let response: Response;
    try {
      // lgtm [js/request-forgery] URL is revalidated (protocol + DNS + private-range blocking) before every request.
      response = await fetch(safeCurrentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": opts.userAgent },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response missing location header.");
      if (i === MAX_REDIRECTS) throw new Error("Too many redirects.");
      const nextUrl = new URL(location, currentUrl);
      await validateOutboundUrl(nextUrl.toString());
      redirects.push(nextUrl.toString());
      currentUrl = nextUrl;
      continue;
    }

    return { response, finalUrl: currentUrl, redirects };
  }

  throw new Error("Unable to fetch URL.");
}

export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`Response exceeded size limit (${maxBytes} bytes).`);
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
