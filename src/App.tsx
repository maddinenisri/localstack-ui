import StatusBar from './components/StatusBar'
import SesInbox from './components/SesInbox'
import SnsMessages from './components/SnsMessages'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-white">LocalStack Inspector</h1>
          <StatusBar />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-6">
        <SesInbox />
        <SnsMessages />
      </main>

      <footer className="border-t border-gray-800 px-6 py-3 text-center text-xs text-gray-600">
        Auto-refreshes every 5s &middot; Proxied via nginx sidecar
      </footer>
    </div>
  )
}
