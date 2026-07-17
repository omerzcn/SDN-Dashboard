import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TrafficJobParams, TrafficResult, TrafficType } from '@/services/trafficAgent'

export interface ActiveTrafficJob {
  agentIp: string
  agentHostId: string
  targetHostId: string
  params: TrafficJobParams
  startedAt: number
}

export interface TrafficRunRecord {
  id: string
  timestamp: string   
  sourceLabel: string
  targetLabel: string
  type: TrafficType
  result: TrafficResult
}

interface TrafficState {
  activeJob: ActiveTrafficJob | null
  result: TrafficResult | null
  running: boolean
  error: string | null
  history: TrafficRunRecord[]

  startJob: (job: ActiveTrafficJob) => void
  setResult: (result: TrafficResult | null) => void
  setRunning: (running: boolean) => void
  setError: (error: string | null) => void
  clear: () => void
  addHistoryEntry: (entry: TrafficRunRecord) => void
  clearHistory: () => void
}

export const useTrafficStore = create<TrafficState>()(
  persist(
    (set) => ({
      activeJob: null,
      result: null,
      running: false,
      error: null,
      history: [],

      startJob: (job) => set({ activeJob: job, result: null, running: true, error: null }),
      setResult: (result) => set({ result }),
      setRunning: (running) => set({ running }),
      setError: (error) => set({ error }),
      clear: () => set({ activeJob: null, result: null, running: false, error: null }),

      addHistoryEntry: (entry) =>
        set((s) => ({ history: [entry, ...s.history].slice(0, 50) })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'sdn-dashboard-traffic',
      partialize: (state) => ({ history: state.history }),
    },
  ),
)
