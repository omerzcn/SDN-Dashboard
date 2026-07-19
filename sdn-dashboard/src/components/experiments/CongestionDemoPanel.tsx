/**
 * Congestion Demo
 *
 * The Live Traffic Generator above just sends a normal request between two
 * hosts. This panel does something different: it looks up a path's real
 * capacity (via the same ONOS path query as Path Finder), then lets you
 * deliberately send UDP traffic faster than that real link can carry, to
 * prove a genuine physical bandwidth ceiling exists by watching real packet
 * loss appear.
 */

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Search, Play, Square } from 'lucide-react'
import { useNetworkStore } from '@/stores/networkStore'
import { useTrafficStore } from '@/stores/trafficStore'
import { getPaths } from '@/services/onosApi'
import { pathBottleneckMbps } from '@/utils/pathBottleneck'
import { startTraffic, stopTraffic, pollTrafficResult } from '@/services/trafficAgent'
import type { TrafficJobParams, TrafficResult } from '@/services/trafficAgent'
import { formatPercent, formatBandwidth } from '@/utils/format'
import { clsx } from 'clsx'

const POLL_MS = 2000
const selectClass = 'px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sdn-500'

export const CongestionDemoPanel = () => {
  const devices = useNetworkStore((s) => s.devices)
  const links = useNetworkStore((s) => s.links)
  const hosts = devices.filter((d) => d.type === 'host')
  const addHistoryEntry = useTrafficStore((s) => s.addHistoryEntry)

  const [sourceHostId, setSourceHostId] = useState('')
  const [targetHostId, setTargetHostId] = useState('')

  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [bottleneck, setBottleneck] = useState<number | null>(null)
  const [bw, setBw] = useState<number | null>(null)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<TrafficResult | null>(null)
  const jobRef = useRef<{ agentIp: string; sourceLabel: string; targetLabel: string } | null>(null)

  // Independent poll loop — this panel does not share job state with the
  // Traffic Generator panel, so it drives its own result polling.
  useEffect(() => {
    if (!running || !jobRef.current) return
    const timer = setInterval(async () => {
      const r = await pollTrafficResult(jobRef.current!.agentIp)
      if (!r) return
      setResult(r)
      if (r.done) {
        setRunning(false)
        addHistoryEntry({
          id: `run-${Date.now()}`,
          timestamp: new Date().toISOString(),
          sourceLabel: jobRef.current!.sourceLabel,
          targetLabel: jobRef.current!.targetLabel,
          type: 'udp',
          result: r,
        })
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, addHistoryEntry])

  const handleCheck = async () => {
    if (!sourceHostId || !targetHostId) return
    setChecking(true)
    setCheckError(null)
    setBottleneck(null)
    try {
      const paths = await getPaths(sourceHostId, targetHostId)
      const b = paths[0] ? pathBottleneckMbps(paths[0], links) : null
      if (b === null) {
        setCheckError('No matching real link data for this path yet.')
      } else {
        setBottleneck(b)
        setBw(Math.ceil(b * 1.5))
      }
    } catch {
      setCheckError('Could not reach ONOS to check the path.')
    } finally {
      setChecking(false)
    }
  }

  const handleStart = async () => {
    const source = hosts.find((h) => h.id === sourceHostId)
    const target = hosts.find((h) => h.id === targetHostId)
    if (!source?.ipAddress || !target?.ipAddress || !bw) return

    const params: TrafficJobParams = {
      type: 'udp',
      target: target.ipAddress,
      dst_port: 5201,
      duration: 10,
      bw,
      streams: 1,
    }

    setRunError(null)
    setResult(null)
    try {
      await startTraffic(source.ipAddress, params)
      jobRef.current = { agentIp: source.ipAddress, sourceLabel: source.label, targetLabel: target.label }
      setRunning(true)
    } catch {
      setRunError('Could not reach the agent — check the relay and agent are running')
    }
  }

  const handleStop = async () => {
    if (jobRef.current) await stopTraffic(jobRef.current.agentIp)
    setRunning(false)
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Congestion Demo</span>
        {running && <span className="badge badge-green ml-auto text-[10px]">Running</span>}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Finds a path's real capacity, then deliberately sends UDP traffic
        above it to show genuine packet loss under congestion — proving a
        real bandwidth limit exists, not just moving data between hosts.
      </p>

      {!running && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select value={sourceHostId} onChange={(e) => setSourceHostId(e.target.value)} className={selectClass}>
              <option value="">Source host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
            </select>
            <select value={targetHostId} onChange={(e) => setTargetHostId(e.target.value)} className={selectClass}>
              <option value="">Target host…</option>
              {hosts.filter((h) => h.id !== sourceHostId).map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
            </select>

            <button
              onClick={handleCheck}
              disabled={!sourceHostId || !targetHostId || checking}
              className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sdn-600/20 text-sdn-400 hover:bg-sdn-600/30 disabled:opacity-40 border border-sdn-600/20 text-xs font-medium transition-colors"
            >
              <Search className="w-3.5 h-3.5" /> {checking ? 'Checking path…' : 'Check Real Path Capacity'}
            </button>
          </div>

          {checkError && <p className="text-xs text-red-400">{checkError}</p>}

          {bottleneck !== null && (
            <div className="bg-slate-800/60 rounded-lg p-2.5 space-y-2">
              <p className="text-[11px] text-slate-400">
                Real path capacity: <span className="font-mono text-slate-200">{bottleneck.toFixed(0)} Mbps</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={bw ?? ''}
                  onChange={(e) => setBw(Number(e.target.value))}
                  className={clsx(selectClass, 'flex-1')}
                  placeholder="UDP bandwidth (Mbps)"
                />
                <button
                  onClick={handleStart}
                  disabled={!bw}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-40 border border-red-600/20 text-xs font-medium transition-colors"
                >
                  <Play className="w-3.5 h-3.5" /> Overload
                </button>
              </div>
              <p className="text-[10px] text-slate-600">
                Pre-filled to 1.5× the real capacity — above this, real loss should appear.
              </p>
            </div>
          )}
        </>
      )}

      {running && (
        <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/60 rounded-lg px-3 py-2">
          <span>{jobRef.current?.sourceLabel} → {jobRef.current?.targetLabel} · UDP {bw} Mbps</span>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/20 text-xs font-medium transition-colors"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        </div>
      )}

      {runError && <p className="text-xs text-red-400">{runError}</p>}

      {result?.done && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/40">
          {result.throughput_mbps !== undefined && (
            <div className="bg-slate-800/60 rounded-lg p-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Actual Throughput</p>
              <p className="text-sm font-mono text-slate-200">{formatBandwidth(result.throughput_mbps)}</p>
            </div>
          )}
          {result.lost_pct !== undefined && (
            <div className="bg-slate-800/60 rounded-lg p-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Real Packet Loss</p>
              <p className={clsx('text-sm font-mono', result.lost_pct ? 'text-red-400' : 'text-slate-200')}>
                {formatPercent(result.lost_pct)}
              </p>
            </div>
          )}
          {result.error && <p className="col-span-2 text-xs text-red-400">Agent error: {result.error}</p>}
        </div>
      )}
    </div>
  )
}
