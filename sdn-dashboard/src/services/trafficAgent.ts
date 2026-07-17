/**
 * Flask traffic-generator agent client.
 *
 * Uses the same host agent (ping_agent.py) and relay path as pingAgent.ts
 * the agent's /start, /stop, /result routes drive iperf3/ping on the host
 * itself, reached through the ONOS PC's relay since the browser has no
 * direct route to the host subnet.
 */

import { useSettingsStore } from '@/stores/settingsStore'

const AGENT_PORT = 5005
const RELAY_PORT = 5010

export type TrafficType = 'ping' | 'tcp' | 'udp'

export interface TrafficJobParams {
  type: TrafficType
  target: string      // destination host IP
  dst_port: number    // ignored by the agent for 'ping'
  duration: number     // seconds for tcp/udp, ping count for 'ping'
  bw?: number          // Mbps
  streams?: number     // parallel iperf3 streams
}

export interface TrafficResult {
  done: boolean
  // ping
  avg_rtt_ms?: number | null
  packet_loss_pct?: number | null
  // iperf3 (tcp/udp)
  throughput_mbps?: number
  retransmits?: number
  jitter_ms?: number
  lost_pct?: number
  error?: string
}

const relayUrl = (agentIp: string, subpath: string) => {
  const relayHost = useSettingsStore.getState().connection.onosHost
  return `http://${relayHost}:${RELAY_PORT}/relay/${agentIp}/${AGENT_PORT}/${subpath}`
}

export const startTraffic = async (agentIp: string, params: TrafficJobParams): Promise<void> => {
  await fetch(relayUrl(agentIp, 'start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export const stopTraffic = async (agentIp: string): Promise<void> => {
  await fetch(relayUrl(agentIp, 'stop'), { method: 'POST' })
}

export const pollTrafficResult = async (agentIp: string): Promise<TrafficResult | null> => {
  try {
    const res = await fetch(relayUrl(agentIp, 'result'))
    return await res.json()
  } catch {
    return null
  }
}
