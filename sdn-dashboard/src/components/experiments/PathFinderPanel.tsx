/**
 * Path Finder
 *
 * Asks ONOS directly which real path(s) it currently computes between two hosts
 */

import { useState } from 'react'
import { Route, Search } from 'lucide-react'
import { useNetworkStore } from '@/stores/networkStore'
import { getPaths } from '@/services/onosApi'
import type { OnosPathResult, OnosPathEndpoint } from '@/services/onosApi'
import { clsx } from 'clsx'

// A path endpoint is either a switch (device) or a host-facing EDGE hop
// (host): ONOS uses different field names for each.
const endpointId = (e: OnosPathEndpoint): string => e.device ?? e.host ?? ''

const selectClass = 'px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sdn-500'

export const PathFinderPanel = () => {
  const devices = useNetworkStore((s) => s.devices)
  const links = useNetworkStore((s) => s.links)
  const hosts = devices.filter((d) => d.type === 'host')

  const [srcHostId, setSrcHostId] = useState('')
  const [dstHostId, setDstHostId] = useState('')
  const [paths, setPaths] = useState<OnosPathResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deviceLabel = (id: string) => devices.find((d) => d.id === id)?.label ?? id

  // Smallest real link capacity along the path: the true ceiling for
  // end-to-end throughput, matched against the same live link data used
  // elsewhere in the app.
  const bottleneckMbps = (path: OnosPathResult): number | null => {
    const known = path.links
      .map((l) => {
        if (l.src.host || l.dst.host) {
          // Host-facing edge hop — match by switch device+port only, since
          // our stored host-access links use a synthetic port on the host
          // side rather than ONOS's real edge port number.
          const hostId = l.src.host ?? l.dst.host
          const sw    = l.src.host ? l.dst : l.src
          const match = links.find((link) =>
            link.sourceDeviceId === sw.device &&
            link.sourcePort === Number(sw.port) &&
            link.targetDeviceId === hostId,
          )
          return match?.capacityMbps
        }
        const srcPort = Number(l.src.port)
        const dstPort = Number(l.dst.port)
        const match = links.find((link) =>
          (link.sourceDeviceId === l.src.device && link.sourcePort === srcPort &&
            link.targetDeviceId === l.dst.device && link.targetPort === dstPort) ||
          (link.sourceDeviceId === l.dst.device && link.sourcePort === dstPort &&
            link.targetDeviceId === l.src.device && link.targetPort === srcPort),
        )
        return match?.capacityMbps
      })
      .filter((c): c is number => c !== undefined)
    return known.length > 0 ? Math.min(...known) : null
  }

  const handleFind = async () => {
    if (!srcHostId || !dstHostId) return
    setLoading(true)
    setError(null)
    setPaths(null)
    try {
      setPaths(await getPaths(srcHostId, dstHostId))
    } catch {
      setError('Could not reach ONOS — check the connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Route className="w-4 h-4 text-sdn-400" />
        <span className="text-sm font-semibold text-slate-200">Path Finder</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={srcHostId} onChange={(e) => setSrcHostId(e.target.value)} className={selectClass}>
          <option value="">Source host…</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
        </select>
        <select value={dstHostId} onChange={(e) => setDstHostId(e.target.value)} className={selectClass}>
          <option value="">Destination host…</option>
          {hosts.filter((h) => h.id !== srcHostId).map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
        </select>

        <button
          onClick={handleFind}
          disabled={!srcHostId || !dstHostId || loading}
          className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sdn-600/20 text-sdn-400 hover:bg-sdn-600/30 disabled:opacity-40 border border-sdn-600/20 text-xs font-medium transition-colors"
        >
          <Search className="w-3.5 h-3.5" /> {loading ? 'Asking ONOS…' : 'Find Path'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {paths && paths.length === 0 && (
        <p className="text-xs text-slate-500">ONOS found no path between these hosts.</p>
      )}

      {paths && paths.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-slate-700/40">
          {paths.map((path, i) => {
            const deviceChain = [
              path.links[0] ? endpointId(path.links[0].src) : '',
              ...path.links.map((l) => endpointId(l.dst)),
            ].filter((id): id is string => Boolean(id))
            const bottleneck = bottleneckMbps(path)

            return (
              <div key={i} className="bg-slate-800/60 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Path {i + 1} · {path.links.length} hop{path.links.length !== 1 ? 's' : ''} · cost {path.cost}</span>
                  {bottleneck !== null && (
                    <span className={clsx('font-mono', bottleneck < 10 ? 'text-amber-400' : 'text-slate-400')}>
                      bottleneck {bottleneck.toFixed(0)} Mbps
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-200 font-mono">
                  {deviceChain.map((id, idx) => (
                    <span key={id + idx} className="flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-slate-700/60">{deviceLabel(id)}</span>
                      {idx < deviceChain.length - 1 && <span className="text-slate-600">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
