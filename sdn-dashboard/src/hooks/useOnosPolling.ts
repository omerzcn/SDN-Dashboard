/**
 * useOnosPolling
 *
 * Polls the real ONOS REST API at configurable intervals and pushes
 * results into Zustand stores (networkStore, flowStore, metricsStore).
 *
 * Call once at the app root (App.tsx) when DEMO_MODE = false.
 */

import { useEffect, useRef, useCallback } from 'react'
import { fetchTopology, fetchPortStats } from '@/services/onosApi'
import { fetchRtt } from '@/services/pingAgent'
import { useNetworkStore } from '@/stores/networkStore'
import { useFlowStore } from '@/stores/flowStore'
import { useMetricsStore } from '@/stores/metricsStore'
import { useSettingsStore } from '@/stores/settingsStore'

// Default polling intervals (ms) — overridable via .env.local
const TOPOLOGY_MS = Number(import.meta.env.VITE_TOPOLOGY_POLL_MS ?? 5_000)
const FLOWS_MS    = Number(import.meta.env.VITE_FLOWS_POLL_MS    ?? 3_000)
const METRICS_MS  = Number(import.meta.env.VITE_METRICS_POLL_MS  ?? 2_000)
const RTT_MS      = Number(import.meta.env.VITE_RTT_POLL_MS      ?? 5_000)

export const useOnosPolling = () => {
  const setTopology    = useNetworkStore((s) => s.setTopology)
  const addAlert       = useNetworkStore((s) => s.addAlert)
  const setWsState     = useNetworkStore((s) => s.setWsConnectionState)
  const setFlows       = useFlowStore((s) => s.setFlows)
  const updateLinkMetrics = useMetricsStore((s) => s.updateLinkMetrics)

  // Track previous device set to detect joins/leaves
  const prevDeviceIds  = useRef<Set<string>>(new Set())
  const topoTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const metricsTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const rttTimer       = useRef<ReturnType<typeof setInterval> | null>(null)

  // Instantaneous Throughput (Byte-Delta Method).
  // ONOS's own port-stat counters only refresh internally every few seconds —
  // slower than our METRICS_MS poll — so a counter often comes back unchanged
  // between polls. We track, per counter, the byte value AND the timestamp of
  // when it actually last changed, so the rate is computed against the real
  // sampling interval instead of our poll interval (which would divide a
  // multi-second byte jump by a much shorter elapsed time and wildly overstate
  // the rate). On an unchanged poll we hold the last computed rate steady.
  const byteSamplesRef = useRef<Map<string, { bytes: number; ts: number; rateBps: number }>>(new Map())

  // How long we'll hold the last real rate while waiting for ONOS's counter to
  // refresh before assuming traffic actually stopped and decaying to 0.
  const STALE_HOLD_MS = METRICS_MS * 4

  const trackRateBps = (key: string, currentBytes: number, now: number): number => {
    const prev = byteSamplesRef.current.get(key)
    if (!prev) {
      byteSamplesRef.current.set(key, { bytes: currentBytes, ts: now, rateBps: 0 })
      return 0
    }
    if (currentBytes === prev.bytes) {
      if (now - prev.ts > STALE_HOLD_MS) prev.rateBps = 0
      return prev.rateBps
    }
    const deltaBytes = Math.max(0, currentBytes - prev.bytes)
    const deltaSec   = Math.max(0.001, (now - prev.ts) / 1000)
    const rateBps    = (deltaBytes * 8) / deltaSec
    byteSamplesRef.current.set(key, { bytes: currentBytes, ts: now, rateBps })
    return rateBps
  }

  // ── Topology + flows poll ─────────────────────────────────────────────────
  const pollTopology = useCallback(async () => {
    try {
      const { topology, flows } = await fetchTopology()
      setTopology(topology)
      setFlows(flows)
      setWsState('connected')

      // Detect new / removed devices and emit alerts
      const currentIds = new Set(topology.devices.map((d) => d.id))
      const prev       = prevDeviceIds.current

      currentIds.forEach((id) => {
        if (!prev.has(id)) {
          const dev = topology.devices.find((d) => d.id === id)
          if (dev && dev.type !== 'controller') {
            addAlert({
              severity: 'info',
              title: 'New device discovered',
              message: `${dev.label} (${dev.ipAddress}) joined the network`,
              deviceId: id,
            })
          }
        }
      })
      prev.forEach((id) => {
        if (!currentIds.has(id)) {
          addAlert({
            severity: 'warning',
            title: 'Device lost',
            message: `Device ${id} is no longer reachable`,
            deviceId: id,
          })
        }
      })

      prevDeviceIds.current = currentIds
    } catch (err) {
      setWsState('error')
      console.warn('[OnosPolling] topology fetch failed:', err)
    }
  }, [setTopology, setFlows, setWsState, addAlert])

  // ── Port statistics → link metrics poll ──────────────────────────────────
  const pollMetrics = useCallback(async () => {
    const switchIds = useNetworkStore.getState().devices
      .filter((d) => d.type === 'switch' && d.onosId)
      .map((d) => d.onosId!)

    if (switchIds.length === 0) return

    try {
      const stats = await fetchPortStats(switchIds)
      const ts    = Date.now()

      // Group by deviceId, derive per-link throughput from port byte counters
      const byDevice = new Map<string, typeof stats>()
      stats.forEach((s) => {
        if (!byDevice.has(s.deviceId)) byDevice.set(s.deviceId, [])
        byDevice.get(s.deviceId)!.push(s)
      })

      // For each link, reading source so it appears in dashboard
      const links = useNetworkStore.getState().links
      links.forEach((link) => {
        if (!link.isUp) return
        const srcStats = byDevice.get(link.sourceDeviceId)
          ?.find((s) => s.port === link.sourcePort)
        const dstStats = byDevice.get(link.targetDeviceId)
          ?.find((s) => s.port === link.targetPort)

        if (srcStats) {
          const srcKey    = `${link.sourceDeviceId}:${link.sourcePort}:tx`
          const srcRateBps = trackRateBps(srcKey, srcStats.txBytes, ts)

          let dstRateBps = 0
          if (dstStats) {
            // Switch-to-switch link for both directions
            const dstKey = `${link.targetDeviceId}:${link.targetPort}:tx`
            dstRateBps = trackRateBps(dstKey, dstStats.txBytes, ts)
          } else {
            // Host-access link
            const srcRxKey = `${link.sourceDeviceId}:${link.sourcePort}:rx`
            dstRateBps = trackRateBps(srcRxKey, srcStats.rxBytes, ts)
          }

          const tputMbps = (srcRateBps + dstRateBps) / 1e6

          const utilPct = Math.min(100, (tputMbps / link.capacityMbps) * 100)

          const totalDropped =
            srcStats.rxDropped + srcStats.txDropped +
            (dstStats?.rxDropped ?? 0) + (dstStats?.txDropped ?? 0)
          const totalPackets =
            srcStats.rxPackets + srcStats.txPackets +
            (dstStats?.rxPackets ?? 0) + (dstStats?.txPackets ?? 0)
          const dropRatePct  = (totalDropped / Math.max(totalPackets, 1)) * 100

          updateLinkMetrics(link.id, {
            bandwidth:  tputMbps,
            latency:    link.latencyMs,
            packetLoss: dropRatePct,
            rxBytes:    srcStats.rxBytes,
            txBytes:    srcStats.txBytes,
          }, ts)

          useNetworkStore.getState().updateLink({
            ...link,
            throughputMbps: tputMbps,
            utilizationPct: utilPct,
            packetLossPct: dropRatePct,
          })
        }
      })
    } catch (err) {
      console.warn('[OnosPolling] metrics fetch failed:', err)
    }
  }, [updateLinkMetrics])

  // RTT probe poll: each configured host agent pings its target host,
  // result is written onto that host's access link as latencyMs
  const pollRtt = useCallback(async () => {
    const entries = Object.entries(useSettingsStore.getState().rpiAgents)
    if (entries.length === 0) return

    const devices    = useNetworkStore.getState().devices
    const links      = useNetworkStore.getState().links
    const updateLink = useNetworkStore.getState().updateLink

    await Promise.all(entries.map(async ([hostId, { agentIp, targetHostId }]) => {
      const targetIp = devices.find((d) => d.id === targetHostId)?.ipAddress
      if (!targetIp) return

      const rtt = await fetchRtt(agentIp, targetIp)
      if (rtt === null) return

      const link = links.find((l) => l.sourceDeviceId === hostId || l.targetDeviceId === hostId)
      if (link) {
        updateLink({ ...link, latencyMs: rtt })
      }
    }))
  }, [])

  // ── Start / stop ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Immediate first fetch
    pollTopology()

    topoTimer.current    = setInterval(pollTopology, TOPOLOGY_MS)
    metricsTimer.current = setInterval(pollMetrics,  METRICS_MS)
    rttTimer.current      = setInterval(pollRtt,      RTT_MS)

    return () => {
      if (topoTimer.current)    clearInterval(topoTimer.current)
      if (metricsTimer.current) clearInterval(metricsTimer.current)
      if (rttTimer.current)     clearInterval(rttTimer.current)
    }
  }, [pollTopology, pollMetrics, pollRtt])
}
