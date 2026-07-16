/* Flask RTT agent */

const AGENT_PORT = 5005

export const fetchRtt = async (agentIp: string, targetIp: string): Promise<number | null> => {
  try {
    const res = await fetch(`http://${agentIp}:${AGENT_PORT}/ping/${targetIp}`)
    const data = await res.json()
    return typeof data.rtt_ms === 'number' ? data.rtt_ms : null
  } catch {
    return null
  }
}
