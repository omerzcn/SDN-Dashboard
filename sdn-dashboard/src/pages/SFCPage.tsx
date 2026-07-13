import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { NetworkTopologyGraph } from '@/components/topology/NetworkTopologyGraph'
import { useSFCStore, SLICE_COLOR_HEX, SF_META } from '@/stores/sfcStore'
import { useNetworkStore } from '@/stores/networkStore'
import { addFlow } from '@/services/onosApi'
import type { ServiceFunctionChain, SFCHop, ChainState, Device, Link, SliceColor } from '@/types'
import { clsx } from 'clsx'
import {
  ArrowRight, Plus, Trash2, Activity, AlertTriangle,
  CheckCircle2, Clock, Layers3, Zap, Loader2, X,
} from 'lucide-react'

const SFC_VLAN_ID = 100

// Added a link id for linkPath, so health-monitoring can match it later
const findLink = (links: Link[], aId: string, bId: string): Link | undefined =>
  links.find((l) =>
    (l.sourceDeviceId === aId && l.targetDeviceId === bId) ||
    (l.targetDeviceId === aId && l.sourceDeviceId === bId),
  )

// Installs VLAN-tagged flow rules for each hop of a chain onto the real
// switches: ingress tags + forwards, transit hops match on the tag alone,
// egress strips the tag before delivering to the destination host.
const deployChainToOnos = async (chain: ServiceFunctionChain) => {
  const { devices, links, addAlert } = useNetworkStore.getState()

  const srcIp = devices.find((d) => d.id === chain.srcHostId)?.ipAddress
  const dstIp = devices.find((d) => d.id === chain.dstHostId)?.ipAddress
  if (!srcIp || !dstIp) {
    throw new Error('Source or destination host not found in the current topology.')
  }
  if (chain.hops.length === 0) {
    throw new Error('Chain has no switch hops to deploy.')
  }

  // Full node path: src host -> each hop switch -> dst host
  const nodePath = [chain.srcHostId, ...chain.hops.map((h) => h.deviceId), chain.dstHostId]

  const findOutPort = (fromId: string, toId: string): number | undefined => {
    const link = findLink(links, fromId, toId)
    if (!link) return undefined
    return link.sourceDeviceId === fromId ? link.sourcePort : link.targetPort
  }

  const newHops: SFCHop[] = []

  for (let i = 0; i < chain.hops.length; i++) {
    const swId = chain.hops[i].deviceId
    const nextNodeId = nodePath[i + 2]
    const outPort = findOutPort(swId, nextNodeId)
    if (outPort === undefined) {
      throw new Error(`No link found from ${swId} to ${nextNodeId} — check the chain's hop order.`)
    }

    const isIngress = i === 0
    const isEgress = i === chain.hops.length - 1
    let result: { flowId: string; deviceId: string }

    if (isIngress && isEgress) {
      // Single-switch chain
      result = await addFlow(swId, 45000,
        { ipSrc: srcIp + '/32', ipDst: dstIp + '/32', ethType: '0x0800' },
        [{ type: 'OUTPUT', port: outPort }],
      )
    } else if (isIngress) {
      result = await addFlow(swId, 45000,
        { ipSrc: srcIp + '/32', ipDst: dstIp + '/32', ethType: '0x0800' },
        [
          { type: 'PUSH_VLAN' },
          { type: 'SET_VLAN_ID', vlanId: SFC_VLAN_ID },
          { type: 'OUTPUT', port: outPort },
        ],
      )
    } else if (isEgress) {
      result = await addFlow(swId, 45000,
        { vlanId: SFC_VLAN_ID },
        [{ type: 'SET_VLAN_ID', vlanId: 0 }, { type: 'OUTPUT', port: outPort }],
      )
    } else {
      result = await addFlow(swId, 45000,
        { vlanId: SFC_VLAN_ID },
        [{ type: 'OUTPUT', port: outPort }],
      )
    }

    newHops.push({ ...chain.hops[i], flowIds: [result.flowId] })
  }

  useSFCStore.getState().updateChain(chain.id, { state: 'active', hops: newHops })

  addAlert({
    severity: 'info',
    title: 'SFC chain deployed',
    message: `"${chain.name}" — flow rules installed on ${chain.hops.length} switch${chain.hops.length !== 1 ? 'es' : ''}.`,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_META: Record<ChainState, { label: string; cls: string }> = {
  active:      { label: 'Active',      cls: 'badge-green' },
  standby:     { label: 'Standby',     cls: 'badge-amber' },
  degraded:    { label: 'Degraded',    cls: 'badge-red' },
  failed:      { label: 'Failed',      cls: 'badge-red' },
  configuring: { label: 'Configuring', cls: 'badge-amber' },
}

const fmtMs = (v: number) => v === 0 ? '—' : `${v.toFixed(2)} ms`
const fmtMbps = (v: number) => v === 0 ? '—' : `${v.toFixed(1)} Mbps`
const fmtLoss = (v: number) => v >= 100 ? '100%' : v < 0.005 ? '0%' : `${v.toFixed(3)}%`
const fmtPkts = (v: number) => v === 0 ? '—' : v > 1e6 ? `${(v / 1e6).toFixed(1)}M` : v > 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)

// Relative bar — fills from 0 to max
const MiniBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="h-1 rounded-full bg-slate-700 overflow-hidden mt-1">
    <div
      className="h-full rounded-full transition-all duration-700"
      style={{ width: `${Math.min(100, max === 0 ? 0 : (value / max) * 100)}%`, background: color }}
    />
  </div>
)

// ── Hop card ──────────────────────────────────────────────────────────────────

const HopCard = ({
  hop,
  device,
  chainColor,
  idx,
  isLast,
}: {
  hop: SFCHop
  device?: { label: string; ipAddress: string } | undefined
  chainColor: string
  idx: number
  isLast: boolean
}) => {
  const meta = SF_META[hop.sfType] ?? { icon: '?', label: hop.sfType }
  const dead = hop.metrics.packetLossPct >= 100

  return (
    <div className="flex items-stretch gap-0">
      {/* Card */}
      <div className={clsx(
        'flex-shrink-0 w-44 rounded-xl border p-3 transition-all',
        dead
          ? 'border-red-500/40 bg-red-500/5'
          : 'border-slate-700/60 bg-slate-800/60',
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: dead ? '#ef444420' : `${chainColor}25`, color: dead ? '#f87171' : chainColor }}
          >
            {idx + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">{device?.label ?? hop.deviceId}</p>
            <p className="text-[10px] text-slate-500 truncate font-mono">{device?.ipAddress}</p>
          </div>
        </div>

        {/* Service function badge */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg mb-2"
          style={{ background: dead ? '#ef444415' : `${chainColor}15` }}
        >
          <span className="text-sm">{meta.icon}</span>
          <span className="text-[11px] font-medium" style={{ color: dead ? '#f87171' : chainColor }}>
            {hop.serviceFunction}
          </span>
        </div>

        {/* Metrics */}
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">Latency</span>
              <span className={clsx('font-mono', dead ? 'text-slate-600' : 'text-slate-300')}>
                {fmtMs(hop.metrics.latencyMs)}
              </span>
            </div>
            <MiniBar value={hop.metrics.latencyMs} max={5} color={dead ? '#475569' : chainColor} />
          </div>
          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">Throughput</span>
              <span className={clsx('font-mono', dead ? 'text-red-400' : 'text-slate-300')}>
                {fmtMbps(hop.metrics.throughputMbps)}
              </span>
            </div>
            <MiniBar value={hop.metrics.throughputMbps} max={100} color={dead ? '#ef4444' : chainColor} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Loss</span>
            <span className={clsx('font-mono', hop.metrics.packetLossPct > 0.1 ? 'text-red-400' : 'text-slate-400')}>
              {fmtLoss(hop.metrics.packetLossPct)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Pkts</span>
            <span className="font-mono text-slate-400">{fmtPkts(hop.metrics.packetsProcessed)}</span>
          </div>
        </div>
      </div>

      {/* Arrow connector */}
      {!isLast && (
        <div className="flex items-center px-1">
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-8 h-0.5 rounded" style={{ background: chainColor, opacity: 0.5 }} />
            <ArrowRight className="w-3 h-3" style={{ color: chainColor, opacity: 0.7 }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chain list row ────────────────────────────────────────────────────────────

const ChainRow = ({
  chain,
  srcLabel,
  dstLabel,
  isSelected,
  onClick,
  onDelete,
}: {
  chain: ServiceFunctionChain
  srcLabel: string
  dstLabel: string
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
}) => {
  const color = SLICE_COLOR_HEX[chain.color]
  const sm = STATE_META[chain.state]
  const totalLatency = chain.hops.reduce((s, h) => s + h.metrics.latencyMs, 0)
  const minTput = Math.min(...chain.hops.map((h) => h.metrics.throughputMbps))

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-800/60',
        'hover:bg-slate-800/40 transition-colors',
        isSelected && 'bg-slate-800/60 border-l-2',
      )}
      style={isSelected ? { borderLeftColor: color } : {}}
    >
      {/* Color dot */}
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100 truncate">{chain.name}</span>
          <span className={clsx('badge text-[10px] flex-shrink-0', sm.cls)}>{sm.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-slate-500 font-mono truncate">
            {srcLabel} → {chain.hops.length} hop{chain.hops.length !== 1 ? 's' : ''} → {dstLabel}
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="hidden xl:flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-[11px] font-mono text-slate-400">{fmtMs(totalLatency)}</span>
        <span className="text-[10px] text-slate-600">total latency</span>
      </div>
      <div className="hidden xl:flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className={clsx('text-[11px] font-mono', minTput === 0 ? 'text-red-400' : 'text-slate-400')}>
          {fmtMbps(minTput)}
        </span>
        <span className="text-[10px] text-slate-600">min tput</span>
      </div>

      {/* Delete btn */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-all ml-1 flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-red-400" />
      </button>
    </div>
  )
}

// ── Chain detail panel ────────────────────────────────────────────────────────

const ChainDetail = ({
  chain,
  devices,
}: {
  chain: ServiceFunctionChain
  devices: Array<{ id: string; label: string; ipAddress: string }>
}) => {
  const color = SLICE_COLOR_HEX[chain.color]
  const sm = STATE_META[chain.state]
  const src = devices.find((d) => d.id === chain.srcHostId)
  const dst = devices.find((d) => d.id === chain.dstHostId)
  const totalLatency = chain.hops.reduce((s, h) => s + h.metrics.latencyMs, 0)
  const minTput = chain.state === 'degraded' || chain.state === 'failed'
    ? 0
    : Math.min(...chain.hops.map((h) => h.metrics.throughputMbps))
  const anyLoss = chain.hops.some((h) => h.metrics.packetLossPct > 0)

  const StateIcon = chain.state === 'active'
    ? CheckCircle2
    : chain.state === 'degraded' || chain.state === 'failed'
    ? AlertTriangle
    : Clock

  const [deploying, setDeploying] = useState(false)
  const addAlert = useNetworkStore((s) => s.addAlert)

  const handleDeploy = async () => {
    setDeploying(true)
    try {
      await deployChainToOnos(chain)
    } catch (err) {
      addAlert({
        severity: 'error',
        title: 'SFC deploy failed',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-slate-700/40 flex-shrink-0"
        style={{ borderTopColor: color, borderTopWidth: 2 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <StateIcon className="w-4 h-4" style={{ color: sm.cls.includes('green') ? '#22c55e' : sm.cls.includes('amber') ? '#f59e0b' : '#ef4444' }} />
          <h3 className="text-sm font-bold text-slate-100">{chain.name}</h3>
          <span className={clsx('badge text-[10px]', sm.cls)}>{sm.label}</span>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-sdn-600 hover:bg-sdn-500 disabled:opacity-50 text-white transition-colors"
          >
            {deploying
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying…</>
              : <><Zap className="w-3.5 h-3.5" /> Deploy to ONOS</>}
          </button>
        </div>
        <p className="text-xs text-slate-500">{chain.description}</p>
      </div>

      {/* Summary stats row */}
      <div className="grid grid-cols-4 divide-x divide-slate-700/40 border-b border-slate-700/40 flex-shrink-0">
        {[
          { label: 'Hops', value: String(chain.hops.length) },
          { label: 'Total Latency', value: fmtMs(totalLatency) },
          { label: 'Min Throughput', value: fmtMbps(minTput) },
          { label: 'Packet Loss', value: anyLoss ? 'Yes' : 'None' },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-2 text-center">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-xs font-mono font-semibold text-slate-200 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Hop diagram — scrollable horizontally */}
      <div className="flex-1 overflow-auto p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Service Chain Path
        </p>

        <div className="flex items-center gap-1 overflow-x-auto pb-2 min-w-max">
          {/* Source host */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
              <span className="text-lg">🖥</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">{src?.label ?? chain.srcHostId}</p>
            <p className="text-[9px] text-slate-600 font-mono">{src?.ipAddress}</p>
          </div>

          {/* Arrow to first hop */}
          <div className="flex items-center flex-shrink-0 px-1">
            <div className="w-6 h-0.5 rounded" style={{ background: color, opacity: 0.4 }} />
            <ArrowRight className="w-3 h-3 -ml-1" style={{ color, opacity: 0.6 }} />
          </div>

          {/* Hop cards */}
          {chain.hops.map((hop, idx) => (
            <HopCard
              key={hop.deviceId + idx}
              hop={hop}
              device={devices.find((d) => d.id === hop.deviceId)}
              chainColor={color}
              idx={idx}
              isLast={idx === chain.hops.length - 1}
            />
          ))}

          {/* Arrow to dst */}
          <div className="flex items-center flex-shrink-0 px-1">
            <div className="w-6 h-0.5 rounded" style={{ background: color, opacity: 0.4 }} />
            <ArrowRight className="w-3 h-3 -ml-1" style={{ color, opacity: 0.6 }} />
          </div>

          {/* Destination host */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <div className={clsx(
              'w-10 h-10 rounded-full border flex items-center justify-center',
              chain.state === 'degraded'
                ? 'bg-red-500/20 border-red-500/40'
                : 'bg-green-500/20 border-green-500/40',
            )}>
              <span className="text-lg">{chain.state === 'degraded' ? '❌' : '🖥'}</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">{dst?.label ?? chain.dstHostId}</p>
            <p className="text-[9px] text-slate-600 font-mono">{dst?.ipAddress}</p>
          </div>
        </div>

        {/* Flow rule IDs summary */}
        <div className="mt-4 pt-3 border-t border-slate-700/40">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Installed Flow Rules
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chain.hops.flatMap((h) => h.flowIds).map((fid) => (
              <span key={fid} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-mono text-slate-400">
                {fid}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// New Chain button adjustments

const CHAIN_COLORS: SliceColor[] = ['blue', 'green', 'amber', 'red', 'purple']

const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200'
const labelCls = 'text-xs text-slate-400 block mb-1'

const NewChainModal = ({
  devices,
  links,
  onClose,
}: {
  devices: Device[]
  links: Link[]
  onClose: () => void
}) => {
  const addChain = useSFCStore((s) => s.addChain)
  const hosts = devices.filter((d) => d.type === 'host')
  const switches = devices.filter((d) => d.type === 'switch')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<SliceColor>('blue')
  const [srcHostId, setSrcHostId] = useState('')
  const [dstHostId, setDstHostId] = useState('')
  const [hopIds, setHopIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const availableHops = switches.filter((sw) => !hopIds.includes(sw.id))

  const removeHop = (id: string) => setHopIds((h) => h.filter((x) => x !== id))

  const handleCreate = () => {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!srcHostId || !dstHostId) { setError('Select a source and destination host.'); return }
    if (srcHostId === dstHostId) { setError('Source and destination must be different hosts.'); return }
    if (hopIds.length === 0) { setError('Add at least one switch hop.'); return }

    // link IDs for the full path
    const nodePath = [srcHostId, ...hopIds, dstHostId]
    const linkPath: string[] = []
    for (let i = 0; i < nodePath.length - 1; i++) {
      const link = findLink(links, nodePath[i], nodePath[i + 1])
      if (!link) {
        setError(`No real link found between ${nodePath[i]} and ${nodePath[i + 1]} — check hop order.`)
        return
      }
      linkPath.push(link.id)
    }

    addChain({
      name: name.trim(),
      description: description.trim() || 'Manually built chain',
      color,
      srcHostId,
      dstHostId,
      state: 'configuring',
      linkPath,
      hops: hopIds.map((id, i) => ({
        deviceId: id,
        serviceFunction: `Hop ${i + 1}`,
        sfType: 'monitor',
        flowIds: [],
        metrics: { latencyMs: 0, throughputMbps: 0, packetLossPct: 0, packetsProcessed: 0 },
      })),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card p-6 w-[26rem] space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">New Service Function Chain</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-700/50">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={selectCls}
              placeholder="e.g. Test SFC"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={selectCls}
              placeholder="optional"
            />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <div className="flex gap-2">
              {CHAIN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={clsx(
                    'w-6 h-6 rounded-full border-2 transition-all',
                    color === c ? 'border-slate-200 scale-110' : 'border-transparent',
                  )}
                  style={{ background: SLICE_COLOR_HEX[c] }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Source host</label>
              <select value={srcHostId} onChange={(e) => setSrcHostId(e.target.value)} className={selectCls}>
                <option value="">Select…</option>
                {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Destination host</label>
              <select value={dstHostId} onChange={(e) => setDstHostId(e.target.value)} className={selectCls}>
                <option value="">Select…</option>
                {hosts.map((h) => <option key={h.id} value={h.id}>{h.label} ({h.ipAddress})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Switch hops (in order, source → destination)</label>
            <select value="" onChange={(e) => e.target.value && setHopIds((h) => [...h, e.target.value])} className={selectCls}>
              <option value="">+ Add switch…</option>
              {availableHops.map((sw) => <option key={sw.id} value={sw.id}>{sw.label}</option>)}
            </select>
            {hopIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {hopIds.map((id, i) => {
                  const sw = switches.find((s) => s.id === id)
                  return (
                    <span key={id} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300">
                      {i + 1}. {sw?.label ?? id}
                      <button onClick={() => removeHop(id)} className="text-slate-500 hover:text-red-400 ml-1">×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} className="px-4 py-1.5 rounded bg-sdn-600 hover:bg-sdn-500 text-white text-sm transition-colors">
            Create Chain
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const SFCPage = () => {
  const { chains, selectedChainId, setSelectedChain, removeChain } = useSFCStore()
  const devices = useNetworkStore((s) => s.devices)
  const links = useNetworkStore((s) => s.links)

  const [showAddModal, setShowAddModal] = useState(false)

  const selectedChain = chains.find((c) => c.id === selectedChainId) ?? null

  // Compute device IDs + link IDs to highlight from selected chain
  const highlightDeviceIds = selectedChain
    ? [
        selectedChain.srcHostId,
        ...selectedChain.hops.map((h) => h.deviceId),
        selectedChain.dstHostId,
      ]
    : []

  const highlightLinkIds = selectedChain?.linkPath ?? []
  const highlightColor = selectedChain ? SLICE_COLOR_HEX[selectedChain.color] : '#38bdf8'

  const activeCount = chains.filter((c) => c.state === 'active').length
  const degradedCount = chains.filter((c) => c.state === 'degraded' || c.state === 'failed').length

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        title="Service Function Chains"
        subtitle={`${chains.length} chains · ${activeCount} active · ${degradedCount > 0 ? `${degradedCount} degraded` : 'all healthy'}`}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── LEFT: Topology ─────────────────────────────────────────────── */}
        <div className="w-[55%] flex flex-col border-r border-slate-700/40">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700/40 flex-shrink-0 bg-slate-900/50">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Topology</span>
            {selectedChain && (
              <>
                <span className="w-2 h-2 rounded-full" style={{ background: highlightColor }} />
                <span className="text-xs text-slate-400">
                  Showing path for <span className="text-slate-200">{selectedChain.name}</span>
                </span>
              </>
            )}
            {!selectedChain && (
              <span className="text-xs text-slate-600">Select a chain to highlight its path</span>
            )}
          </div>

          {/* Topology canvas */}
          <div className="flex-1 relative min-h-0">
            <NetworkTopologyGraph
              highlightDeviceIds={highlightDeviceIds}
              highlightLinkIds={highlightLinkIds}
              highlightColor={highlightColor}
            />
          </div>
        </div>

        {/* ── RIGHT: Chain list + detail ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">

          {/* Chain list header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 flex-shrink-0 bg-slate-900/50">
            <Layers3 className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Chains</span>
            <span className="text-xs text-slate-500">({chains.length})</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-sdn-600 hover:bg-sdn-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Chain
            </button>
          </div>

          {/* Chain list */}
          <div className="flex-shrink-0 overflow-y-auto border-b border-slate-700/40" style={{ maxHeight: '40%' }}>
            {chains.map((chain) => {
              const src = devices.find((d) => d.id === chain.srcHostId)
              const dst = devices.find((d) => d.id === chain.dstHostId)
              return (
                <ChainRow
                  key={chain.id}
                  chain={chain}
                  srcLabel={src?.label ?? chain.srcHostId}
                  dstLabel={dst?.label ?? chain.dstHostId}
                  isSelected={chain.id === selectedChainId}
                  onClick={() => setSelectedChain(chain.id === selectedChainId ? null : chain.id)}
                  onDelete={() => removeChain(chain.id)}
                />
              )
            })}
            {chains.length === 0 && (
              <div className="px-4 py-10 text-center text-slate-500 text-sm">
                No chains defined. Click "New Chain" to add one.
              </div>
            )}
          </div>

          {/* Chain detail */}
          <div className="flex-1 overflow-hidden min-h-0">
            {selectedChain ? (
              <ChainDetail chain={selectedChain} devices={devices} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                <Layers3 className="w-10 h-10 opacity-30" />
                <p className="text-sm">Select a chain to view hop-by-hop performance</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Chain modal */}
      {showAddModal && (
        <NewChainModal
          devices={devices}
          links={links}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
