/**
 * Run Comparison
 *
 * Picks two runs from the Traffic Generator's existing History and shows
 * them side by side: e.g. a baseline run before installing a flow rule
 * or deploying a chain, against a run taken after. 
 */

import { useState } from 'react'
import { GitCompare } from 'lucide-react'
import { useTrafficStore } from '@/stores/trafficStore'
import type { TrafficRunRecord } from '@/stores/trafficStore'
import type { TrafficResult } from '@/services/trafficAgent'
import { formatBandwidth, formatLatency, formatPercent, formatDate } from '@/utils/format'
import { clsx } from 'clsx'

const selectClass = 'px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sdn-500'

const runLabel = (r: TrafficRunRecord) =>
  `${formatDate(r.timestamp)} · ${r.sourceLabel} → ${r.targetLabel} · ${r.type.toUpperCase()}`

// Metrics worth comparing, and whether a lower or higher value is "better".
const METRICS: Array<{
  key: keyof TrafficResult
  label: string
  format: (v: number) => string
  higherIsBetter: boolean
}> = [
  { key: 'throughput_mbps',  label: 'Throughput',   format: formatBandwidth, higherIsBetter: true },
  { key: 'avg_rtt_ms',       label: 'Avg RTT',      format: formatLatency,   higherIsBetter: false },
  { key: 'jitter_ms',        label: 'Jitter',       format: formatLatency,   higherIsBetter: false },
  { key: 'packet_loss_pct',  label: 'Packet Loss',  format: formatPercent,  higherIsBetter: false },
  { key: 'lost_pct',         label: 'Loss',         format: formatPercent,  higherIsBetter: false },
  { key: 'retransmits',      label: 'Retransmits',  format: (v) => String(v), higherIsBetter: false },
]

export const RunComparisonPanel = () => {
  const history = useTrafficStore((s) => s.history)

  const [baselineId, setBaselineId] = useState('')
  const [compareId, setCompareId] = useState('')

  const baseline = history.find((r) => r.id === baselineId)
  const compare = history.find((r) => r.id === compareId)

  const rows = METRICS.filter((m) => {
    const a = baseline?.result[m.key]
    const b = compare?.result[m.key]
    return typeof a === 'number' || typeof b === 'number'
  })

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-sdn-400" />
        <span className="text-sm font-semibold text-slate-200">Run Comparison</span>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Pick two completed Traffic Generator runs from History — for
        example one before and one after installing a flow rule or
        deploying a chain — to see exactly what changed, side by side.
      </p>

      {history.length < 2 ? (
        <p className="text-[10px] text-slate-600 italic">
          Run at least two Traffic Generator tests first — completed runs show up here automatically.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            <select value={baselineId} onChange={(e) => setBaselineId(e.target.value)} className={selectClass}>
              <option value="">Baseline run…</option>
              {history.map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
            </select>
            <select value={compareId} onChange={(e) => setCompareId(e.target.value)} className={selectClass}>
              <option value="">Compare run…</option>
              {history.filter((r) => r.id !== baselineId).map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
            </select>
          </div>

          {baseline && compare && (
            rows.length === 0 ? (
              <p className="text-[10px] text-slate-600 italic">These two runs have no overlapping metrics to compare.</p>
            ) : (
              <div className="pt-1 border-t border-slate-700/40">
                <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500 uppercase tracking-wider px-1 mb-1">
                  <span>Metric</span>
                  <span className="text-right">Baseline</span>
                  <span className="text-right">Compare</span>
                </div>
                <div className="space-y-1">
                  {rows.map((m) => {
                    const a = baseline.result[m.key]
                    const b = compare.result[m.key]
                    const aNum = typeof a === 'number' ? a : null
                    const bNum = typeof b === 'number' ? b : null
                    const improved = aNum !== null && bNum !== null
                      ? (m.higherIsBetter ? bNum > aNum : bNum < aNum)
                      : null
                    const worsened = aNum !== null && bNum !== null
                      ? (m.higherIsBetter ? bNum < aNum : bNum > aNum)
                      : null

                    return (
                      <div key={m.key} className="grid grid-cols-3 gap-2 items-center bg-slate-800/40 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="text-slate-400">{m.label}</span>
                        <span className="text-right font-mono text-slate-300">{aNum !== null ? m.format(aNum) : '—'}</span>
                        <span className={clsx(
                          'text-right font-mono',
                          improved && 'text-green-400',
                          worsened && 'text-red-400',
                          improved === null && 'text-slate-300',
                        )}>
                          {bNum !== null ? m.format(bNum) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
