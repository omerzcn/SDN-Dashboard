import { create } from 'zustand'
import type { TrafficJobParams, TrafficResult } from '@/services/trafficAgent'

export interface ActiveTrafficJob {
  agentIp: string
  agentHostId: string
  targetHostId: string
  params: TrafficJobParams
  startedAt: number
}

interface TrafficState {
  activeJob: ActiveTrafficJob | null
  result: TrafficResult | null
  running: boolean
  error: string | null

  startJob: (job: ActiveTrafficJob) => void
  setResult: (result: TrafficResult | null) => void
  setRunning: (running: boolean) => void
  setError: (error: string | null) => void
  clear: () => void
}

export const useTrafficStore = create<TrafficState>()((set) => ({
  activeJob: null,
  result: null,
  running: false,
  error: null,

  startJob: (job) => set({ activeJob: job, result: null, running: true, error: null }),
  setResult: (result) => set({ result }),
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
  clear: () => set({ activeJob: null, result: null, running: false, error: null }),
}))
