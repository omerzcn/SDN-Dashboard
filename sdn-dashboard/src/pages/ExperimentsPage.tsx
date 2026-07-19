import { TopBar } from '@/components/layout/TopBar'
import { TrafficGeneratorPanel } from '@/components/experiments/TrafficGeneratorPanel'
import { PathFinderPanel } from '@/components/experiments/PathFinderPanel'
import { PingSweepPanel } from '@/components/experiments/PingSweepPanel'
import { CongestionDemoPanel } from '@/components/experiments/CongestionDemoPanel'
import { RunComparisonPanel } from '@/components/experiments/RunComparisonPanel'

export const ExperimentsPage = () => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        title="Experiments"
        subtitle="Generate real traffic on the physical testbed"
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full max-w-md">
            <TrafficGeneratorPanel />
          </div>
          <div className="w-full max-w-md">
            <PathFinderPanel />
          </div>
          <div className="w-full max-w-md">
            <PingSweepPanel />
          </div>
          <div className="w-full max-w-md">
            <CongestionDemoPanel />
          </div>
          <div className="w-full max-w-md">
            <RunComparisonPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
