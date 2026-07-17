/**
 * useSFCMetricsSync
 *
 * Keeps a chain's per-hop metrics (latency, throughput, packet loss) in sync
 * with real link data already polled by useOnosPolling, instead of the
 * frozen-at-zero placeholders set when a chain is created.
 *
 * linkPath[i] is the link that traffic crosses just before reaching
 * hops[i].deviceId (see the chain-creation code in SFCPage.tsx, where
 * nodePath = [srcHost, ...hopIds, dstHost] and linkPath[i] connects
 * nodePath[i] -> nodePath[i + 1] === hops[i].deviceId), so that's the real
 * link each hop's metrics are read from.
 */

import { useEffect } from 'react'
import { useNetworkStore } from '@/stores/networkStore'
import { useSFCStore } from '@/stores/sfcStore'

export const useSFCMetricsSync = () => {
  useEffect(() => {
    return useNetworkStore.subscribe(
      (s) => s.links,
      (links) => {
        const { chains, updateChain } = useSFCStore.getState()

        chains.forEach((chain) => {
          if (chain.state !== 'active' && chain.state !== 'degraded') return

          let changed = false
          const newHops = chain.hops.map((hop, i) => {
            const link = links.find((l) => l.id === chain.linkPath[i])
            if (!link) return hop
            changed = true
            return {
              ...hop,
              metrics: {
                ...hop.metrics,
                latencyMs: link.latencyMs,
                throughputMbps: link.throughputMbps,
                packetLossPct: link.packetLossPct,
              },
            }
          })

          if (changed) updateChain(chain.id, { hops: newHops })
        })
      },
    )
  }, [])
}
