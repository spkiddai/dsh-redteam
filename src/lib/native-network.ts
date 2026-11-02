import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { networkInterfaces } from 'node:os'

const blocked = new BlockList(),
  internal = new BlockList(),
  globalV6 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['224.0.0.0', 3],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
] as const)
  blocked.addSubnet(address, prefix)
for (const [address, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
] as const)
  internal.addSubnet(address, prefix)
internal.addSubnet('fc00::', 7, 'ipv6')
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('2001::', 32, 'ipv6')

export function addressAllowed(address: string, allowInternal: boolean): boolean {
  const family = isIP(address)
  if (!family || address.includes('%')) return false
  const kind = family === 6 ? 'ipv6' : 'ipv4'
  // BlockList also applies IPv4 ranges to IPv4-mapped IPv6 addresses.
  if (blocked.check(address, kind)) return false
  if (internal.check(address, kind)) return allowInternal
  if (family === 6 && !globalV6.check(address, 'ipv6')) return false
  return true
}
export interface ScanNetworkDependencies {
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>
  allowAddress?: (address: string, internal: boolean) => boolean
}
export async function resolveScanAddress(
  host: string,
  options: { allowInternal: boolean; signal: AbortSignal },
  dependencies: ScanNetworkDependencies = {},
) {
  const signal = options.signal
  signal.throwIfAborted()
  const resolve = dependencies.resolve ?? ((host) => lookup(host, { all: true, verbatim: true }))
  const allowAddress =
    dependencies.allowAddress ??
    ((address, allowInternal) => {
      const ownAddresses = new BlockList()
      for (const row of Object.values(networkInterfaces()).flat()) {
        if (row)
          ownAddresses.addAddress(
            row.address.split('%')[0]!,
            row.family === 'IPv6' ? 'ipv6' : 'ipv4',
          )
      }
      const own = ownAddresses.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4')
      return !own && addressAllowed(address, allowInternal)
    })
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await new Promise<{ address: string; family: number }[]>((accept, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        void resolve(host)
          .then(accept, reject)
          .finally(() => signal.removeEventListener('abort', abort))
      })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some((a) => !allowAddress(a.address, options.allowInternal)))
    throw new Error('target-blocked')
  const pinned = addresses[0]!
  return pinned
}
