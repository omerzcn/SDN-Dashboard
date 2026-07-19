/**
 * Shared helper for matching an ONOS-computed path's hops against live link
 * data, to find the smallest real capacity along that path — the true
 * ceiling for end-to-end throughput. Used by Path Finder and the Traffic
 * Generator's congestion-demo hint.
 */

import type { Link } from '@/types'
import type { OnosPathResult, OnosPathLink, OnosPathEndpoint } from '@/services/onosApi'

// A path endpoint is either a switch (device) or a host-facing EDGE hop
// (host): ONOS uses different field names for each.
export const endpointId = (e: OnosPathEndpoint): string => e.device ?? e.host ?? ''

const matchHop = (l: OnosPathLink, links: Link[]): number | undefined => {
  if (l.src.host || l.dst.host) {
    // Host-facing edge hop — match by switch device+port only, since our
    // stored host-access links use a synthetic port on the host side
    // rather than ONOS's real edge port number.
    const hostId = l.src.host ?? l.dst.host
    const sw    = l.src.host ? l.dst : l.src
    return links.find((link) =>
      link.sourceDeviceId === sw.device &&
      link.sourcePort === Number(sw.port) &&
      link.targetDeviceId === hostId,
    )?.capacityMbps
  }
  const srcPort = Number(l.src.port)
  const dstPort = Number(l.dst.port)
  return links.find((link) =>
    (link.sourceDeviceId === l.src.device && link.sourcePort === srcPort &&
      link.targetDeviceId === l.dst.device && link.targetPort === dstPort) ||
    (link.sourceDeviceId === l.dst.device && link.sourcePort === dstPort &&
      link.targetDeviceId === l.src.device && link.targetPort === srcPort),
  )?.capacityMbps
}

export const pathBottleneckMbps = (path: OnosPathResult, links: Link[]): number | null => {
  const known = path.links.map((l) => matchHop(l, links)).filter((c): c is number => c !== undefined)
  return known.length > 0 ? Math.min(...known) : null
}
