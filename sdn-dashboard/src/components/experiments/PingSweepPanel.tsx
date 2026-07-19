/**
 * Ping Sweep
 *
 * Pings every other host from one chosen source host at once, using the
 * same agent /ping route the RTT probe already calls, just fired at
 * multiple targets in parallel instead of one. A fast whole-network
 * reachability check with no manual SSH-ing around.
 */

import { useState } from 'react'
import { Radar, Play } from 'lucide-react'
import { useNetworkStore } from '@/stores/networkStore'
import { fetchRtt } from '@/services/pingAgent'
import { formatLatency } from '@/utils/format'
import { clsx } from 'clsx'

const selectClass = 'px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sdn-500'

interface SweepResult {
  hostId: string
  label: string
  ipAddress: string
  rttMs: number | null
}

export const PingSweepPanel = () => {
  const devices = useNetworkStore((s) => s.devices)
  const hosts = devices.filter((d) => d.type === 'host')

  const [sourceHostId, setSourceHostId] = useState('')
  const [results, setResults] = useState<SweepResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSweep = async () => {
    const source = hosts.find((h) => h.id === sourceHostId)
    if (!source?.ipAddress) return
    const targets = hosts.filter((h) => h.id !== sourceHostId && h.ipAddress)

    setLoading(true)
    setResults(null)
    try {
      const sweep = await Promise.all(targets.map(async (t): Promise<SweepResult> => ({
        hostId: t.id,
        label: t.label,
        ipAddress: t.ipAddress,
        rttMs: await fetchRtt(source.ipAddress, t.ipAddress),
      })))
      setResults(sweep)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Radar className="w-4 h-4 text-sdn-400" />
        <span className="text-sm font-semibold text-slate-200">Ping Sweep</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={sourceHostId}
          onChange={(e) => setSourceHostId(e.target.value)}
          className={clsx(selectClass, 'col-span-2')}
        >
          <option value="">Source host…</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
        </select>

        <button
          onClick={handleSweep}
          disabled={!sourceHostId || loading}
          className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sdn-600/20 text-sdn-400 hover:bg-sdn-600/30 disabled:opacity-40 border border-sdn-600/20 text-xs font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5" /> {loading ? 'Sweeping…' : 'Sweep'}
        </button>
      </div>

      {results && (
        <div className="space-y-1 pt-1 border-t border-slate-700/40">
          {results.length === 0 ? (
            <p className="text-[10px] text-slate-600 italic">No other hosts to sweep.</p>
          ) : (
            results.map((r) => (
              <div key={r.hostId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/40 text-[11px]">
                <span className="text-slate-300 flex-shrink-0">{r.label}</span>
                <span className="text-slate-600 font-mono truncate">{r.ipAddress}</span>
                <span className={clsx('ml-auto font-mono', r.rttMs === null ? 'text-red-400' : 'text-slate-200')}>
                  {r.rttMs === null ? 'unreachable' : formatLatency(r.rttMs)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
