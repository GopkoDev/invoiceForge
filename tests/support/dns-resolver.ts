// Injectable DNS resolver seam for the safe fetcher (T03). The safe fetcher itself is out of
// scope here — this only defines the seam type production code will accept, plus a fake
// implementation tests can wire arbitrary hostname -> address mappings into (so SSRF tests can
// point a hostname at a private/loopback/link-local/metadata address without relying on real
// DNS or /etc/hosts).

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
}

/** The real resolver, backed by Node's `dns.promises`. Production default. */
export function createNodeDnsResolver(): DnsResolver {
  return {
    async resolve(hostname: string): Promise<ResolvedAddress[]> {
      const dns = await import('node:dns/promises');
      const results = await dns.lookup(hostname, { all: true });
      return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
    },
  };
}

/**
 * A resolver a test fully controls: exact hostname -> addresses map, no network, no /etc/hosts.
 * Throws for any hostname not explicitly mapped, so a test can't accidentally rely on a real
 * lookup succeeding.
 */
export function createFakeDnsResolver(
  map: Record<string, ResolvedAddress[]>
): DnsResolver {
  return {
    async resolve(hostname: string): Promise<ResolvedAddress[]> {
      const resolved = map[hostname];
      if (!resolved) {
        throw new Error(`createFakeDnsResolver: no mapping for hostname "${hostname}"`);
      }
      return resolved;
    },
  };
}
