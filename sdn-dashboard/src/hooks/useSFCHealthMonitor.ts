/**
 * useSFCHealthMonitor
 *
 * Watches real link state (already polled by useOnosPolling) and reacts when
 * a link on an active SFC chain's path goes down: marks the chain "degraded"
 * and raises a critical alert. Marks it back "active" (with an info alert)
 * once every link on the path is back up.
 */

import { useEffect } from 'react'
import { useNetworkStore } from '@/stores/networkStore'
import { useSFCStore } from '@/stores/sfcStore'

export const useSFCHealthMonitor = () => {
  useEffect(() => {
    return useNetworkStore.subscribe(
      (s) => s.links,
      (links) => {
        const { chains, updateChainState } = useSFCStore.getState()
        const addAlert = useNetworkStore.getState().addAlert

        chains.forEach((chain) => {
          // A link that disappeared from the topology (e.g. its host went
          // offline) is just as "down" as one still present with isUp:false
          // ONOS stops reporting it instead of flagging it, so a missing id
          // must count as failed too.
          const failedLinkId = chain.linkPath.find((linkId) => {
            const link = links.find((l) => l.id === linkId)
            return !link || !link.isUp
          })

          if (failedLinkId && chain.state === 'active') {
            updateChainState(chain.id, 'degraded')
            addAlert({
              severity: 'critical',
              title: 'SFC Chain Degraded',
              message: `"${chain.name}" — link ${failedLinkId} is down`,
              linkId: failedLinkId,
            })
          }

          if (!failedLinkId && chain.state === 'degraded') {
            updateChainState(chain.id, 'active')
            addAlert({
              severity: 'info',
              title: 'SFC Chain Recovered',
              message: `"${chain.name}" — all links back up`,
            })
          }
        })
      },
    )
  }, [])
}
