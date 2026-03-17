import { usePolling } from '../hooks/usePolling'
import { fetchHealth } from '../api'

export default function StatusBar() {
  const { data, error } = usePolling(fetchHealth, 10000)

  if (error) {
    return (
      <div className="rounded-lg border border-red-700 bg-red-900/50 px-4 py-2 text-sm text-red-200">
        LocalStack is still starting — retrying automatically
      </div>
    )
  }

  if (!data) return null

  const activeServices = Object.entries(data.services).filter(
    ([, status]) => status === 'available' || status === 'running',
  )

  return (
    <div className="flex items-center gap-4 text-sm text-gray-400">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span>
          LocalStack {data.version} ({data.edition})
        </span>
      </div>
      <div className="hidden gap-2 sm:flex">
        {activeServices.map(([name]) => (
          <span
            key={name}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs tracking-wide uppercase"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
