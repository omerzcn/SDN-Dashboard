/**
 * Live Traffic Generator
 *
 * Starts real ping/iperf3 traffic on a host agent (through the relay),
 * and shows the live outcome.
 */

import { useEffect, useState } from 'react'
import { Zap, Play, Square, History, Trash2 } from 'lucide-react'
import { useNetworkStore } from '@/stores/networkStore'
import { useTrafficStore } from '@/stores/trafficStore'
import type { TrafficRunRecord } from '@/stores/trafficStore'
import { startTraffic, stopTraffic, pollTrafficResult } from '@/services/trafficAgent'
import type { TrafficType, TrafficJobParams, TrafficResult } from '@/services/trafficAgent'
import { formatBandwidth, formatLatency, formatPercent, formatDate } from '@/utils/format'
import { clsx } from 'clsx'

const POLL_MS = 2000

const selectClass = 'px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sdn-500'

export const TrafficGeneratorPanel = () => {
  const devices = useNetworkStore((s) => s.devices)
  const hosts = devices.filter((d) => d.type === 'host')

  const activeJob = useTrafficStore((s) => s.activeJob)
  const result = useTrafficStore((s) => s.result)
  const running = useTrafficStore((s) => s.running)
  const error = useTrafficStore((s) => s.error)
  const history = useTrafficStore((s) => s.history)
  const startJob = useTrafficStore((s) => s.startJob)
  const setResult = useTrafficStore((s) => s.setResult)
  const setRunning = useTrafficStore((s) => s.setRunning)
  const setError = useTrafficStore((s) => s.setError)
  const clear = useTrafficStore((s) => s.clear)
  const addHistoryEntry = useTrafficStore((s) => s.addHistoryEntry)
  const clearHistory = useTrafficStore((s) => s.clearHistory)

  const [sourceHostId, setSourceHostId] = useState('')
  const [targetHostId, setTargetHostId] = useState('')
  const [type, setType] = useState<TrafficType>('ping')
  const [dstPort, setDstPort] = useState(5201)
  const [duration, setDuration] = useState(10)
  const [bw, setBw] = useState(20)
  const [streams, setStreams] = useState(1)

  const sourceLabel = hosts.find((h) => h.id === activeJob?.agentHostId)?.label ?? activeJob?.agentHostId ?? ''
  const targetLabel = hosts.find((h) => h.id === activeJob?.targetHostId)?.label ?? activeJob?.targetHostId ?? ''

  // Poll /result every 2s while a job is running
  useEffect(() => {
    if (!running || !activeJob) return
    const timer = setInterval(async () => {
      const r = await pollTrafficResult(activeJob.agentIp)
      if (!r) return
      setResult(r)
      if (r.done) {
        setRunning(false)
        addHistoryEntry({
          id: `run-${Date.now()}`,
          timestamp: new Date().toISOString(),
          sourceLabel,
          targetLabel,
          type: activeJob.params.type,
          result: r,
        })
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, activeJob, setResult, setRunning, addHistoryEntry, sourceLabel, targetLabel])

  const handleStart = async () => {
    const source = hosts.find((h) => h.id === sourceHostId)
    const target = hosts.find((h) => h.id === targetHostId)
    if (!source?.ipAddress || !target?.ipAddress) return

    const params: TrafficJobParams = {
      type,
      target: target.ipAddress,
      dst_port: dstPort,
      duration,
      ...(type === 'udp' ? { bw } : {}),
      ...(type !== 'ping' ? { streams } : {}),
    }

    setError(null)
    try {
      await startTraffic(source.ipAddress, params)
      startJob({
        agentIp: source.ipAddress,
        agentHostId: source.id,
        targetHostId: target.id,
        params,
        startedAt: Date.now(),
      })
    } catch {
      setError('Could not reach the agent — check the relay and agent are running')
    }
  }

  const handleStop = async () => {
    if (activeJob) await stopTraffic(activeJob.agentIp)
    clear()
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-sdn-400" />
        <span className="text-sm font-semibold text-slate-200">Live Traffic Generator</span>
        {running && <span className="badge badge-green ml-auto text-[10px]">Running</span>}
      </div>

      {!running && (
        <div className="grid grid-cols-2 gap-2">
          <select value={sourceHostId} onChange={(e) => setSourceHostId(e.target.value)} className={selectClass}>
            <option value="">Source host…</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
          </select>
          <select value={targetHostId} onChange={(e) => setTargetHostId(e.target.value)} className={selectClass}>
            <option value="">Target host…</option>
            {hosts.filter((h) => h.id !== sourceHostId).map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
          </select>

          <select value={type} onChange={(e) => setType(e.target.value as TrafficType)} className={selectClass}>
            <option value="ping">ICMP Ping</option>
            <option value="tcp">TCP Bulk (iperf3)</option>
            <option value="udp">UDP Constant (CBR)</option>
          </select>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            placeholder={type === 'ping' ? 'Ping count' : 'Duration (s)'}
            className={selectClass}
          />

          {type !== 'ping' && (
            <input
              type="number"
              min={1}
              value={dstPort}
              onChange={(e) => setDstPort(Number(e.target.value))}
              placeholder="Dst port"
              className={selectClass}
            />
          )}
          {type === 'udp' && (
            <input
              type="number"
              min={1}
              value={bw}
              onChange={(e) => setBw(Number(e.target.value))}
              placeholder="Bandwidth (Mbps)"
              className={selectClass}
            />
          )}
          {type !== 'ping' && (
            <input
              type="number"
              min={1}
              value={streams}
              onChange={(e) => setStreams(Number(e.target.value))}
              placeholder="Parallel streams"
              className={selectClass}
            />
          )}

          <button
            onClick={handleStart}
            disabled={!sourceHostId || !targetHostId}
            className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-40 border border-green-600/20 text-xs font-medium transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Start
          </button>
        </div>
      )}

      {running && activeJob && (
        <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/60 rounded-lg px-3 py-2">
          <span>{sourceLabel} → {targetLabel} · {activeJob.params.type.toUpperCase()}</span>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/20 text-xs font-medium transition-colors"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result?.done && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/40">
          {result.avg_rtt_ms !== undefined && (
            <ResultTile label="Avg RTT" value={result.avg_rtt_ms !== null ? formatLatency(result.avg_rtt_ms) : '—'} />
          )}
          {result.packet_loss_pct !== undefined && (
            <ResultTile
              label="Packet Loss"
              value={result.packet_loss_pct !== null ? formatPercent(result.packet_loss_pct) : '—'}
              bad={!!result.packet_loss_pct}
            />
          )}
          {result.throughput_mbps !== undefined && (
            <ResultTile label="Throughput" value={formatBandwidth(result.throughput_mbps)} />
          )}
          {result.jitter_ms !== undefined && (
            <ResultTile label="Jitter" value={`${result.jitter_ms.toFixed(2)} ms`} />
          )}
          {result.lost_pct !== undefined && (
            <ResultTile label="Loss" value={formatPercent(result.lost_pct)} bad={!!result.lost_pct} />
          )}
          {result.retransmits !== undefined && (
            <ResultTile label="Retransmits" value={String(result.retransmits)} />
          )}
          {result.error && <p className="col-span-2 text-xs text-red-400">Agent error: {result.error}</p>}
        </div>
      )}

      {/* History */}
      <div className="pt-2 border-t border-slate-700/40">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400">History</span>
          <span className="text-[10px] text-slate-600">({history.length})</span>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="ml-auto p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic">No completed runs yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {history.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
          </div>
        )}
      </div>
    </div>
  )
}

const ResultTile = ({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) => (
  <div className="bg-slate-800/60 rounded-lg p-2">
    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
    <p className={clsx('text-sm font-mono', bad ? 'text-amber-400' : 'text-slate-200')}>{value}</p>
  </div>
)

// Compact single-line summary of a run's key metric, for the history list.
const summarizeResult = (r: TrafficResult): string => {
  if (r.error) return `error: ${r.error}`
  if (r.throughput_mbps !== undefined) return formatBandwidth(r.throughput_mbps)
  if (r.avg_rtt_ms !== undefined) return r.avg_rtt_ms !== null ? formatLatency(r.avg_rtt_ms) : '—'
  return '—'
}

const HistoryRow = ({ entry }: { entry: TrafficRunRecord }) => (
  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/40 text-[10px]">
    <span className="text-slate-500 flex-shrink-0 font-mono">{formatDate(entry.timestamp)}</span>
    <span className="text-slate-300 truncate">{entry.sourceLabel} → {entry.targetLabel}</span>
    <span className="text-slate-600 uppercase flex-shrink-0">{entry.type}</span>
    <span className={clsx(
      'ml-auto font-mono flex-shrink-0',
      entry.result.error ? 'text-red-400' : 'text-slate-200',
    )}>
      {summarizeResult(entry.result)}
    </span>
  </div>
)
