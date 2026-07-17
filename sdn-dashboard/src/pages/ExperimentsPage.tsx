import { TopBar } from '@/components/layout/TopBar'
import { TrafficGeneratorPanel } from '@/components/experiments/TrafficGeneratorPanel'

export const ExperimentsPage = () => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        title="Experiments"
        subtitle="Generate real traffic on the physical testbed"
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md">
          <TrafficGeneratorPanel />
        </div>
      </div>
    </div>
  )
}
