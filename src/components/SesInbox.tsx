import { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { fetchSesMessages } from '../api'
import type { SesMessage } from '../types'

function EmailDetail({ msg, onClose }: { msg: SesMessage; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-gray-700 bg-gray-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-white">{msg.Subject || '(no subject)'}</h3>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-white">
            &times;
          </button>
        </div>
        <div className="mb-4 space-y-2 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">From:</span> {msg.Source}
          </p>
          <p>
            <span className="text-gray-500">To:</span> {msg.Destination.ToAddresses.join(', ')}
          </p>
          {msg.Destination.CcAddresses.length > 0 && (
            <p>
              <span className="text-gray-500">CC:</span> {msg.Destination.CcAddresses.join(', ')}
            </p>
          )}
          <p>
            <span className="text-gray-500">Date:</span> {new Date(msg.Timestamp).toLocaleString()}
          </p>
          <p>
            <span className="text-gray-500">Region:</span> {msg.Region}
          </p>
          <p>
            <span className="text-gray-500">ID:</span>{' '}
            <code className="rounded bg-gray-800 px-1 text-xs">{msg.Id}</code>
          </p>
        </div>
        {msg.Body.html_part ? (
          <div className="rounded-lg border border-gray-700 bg-white p-4 text-black">
            <iframe
              srcDoc={msg.Body.html_part}
              title="Email body"
              className="min-h-[300px] w-full border-0"
              sandbox=""
            />
          </div>
        ) : (
          <pre className="rounded-lg bg-gray-800 p-4 text-sm whitespace-pre-wrap text-gray-200">
            {msg.Body.text_part || msg.RawData || '(empty body)'}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function SesInbox() {
  const { data, error, loading } = usePolling(fetchSesMessages, 5000)
  const [selected, setSelected] = useState<SesMessage | null>(null)

  const messages = data?.messages ?? []

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span className="text-xl">&#9993;</span> SES Emails
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {messages.length}
          </span>
        </h2>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-800 py-8 text-center text-sm text-gray-600">
          No emails yet. Send one via{' '}
          <code className="rounded bg-gray-800 px-1 text-xs">aws ses send-email</code>
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg) => (
          <button
            key={msg.Id}
            onClick={() => setSelected(msg)}
            className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3 text-left transition-colors hover:border-gray-700 hover:bg-gray-800"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="truncate text-sm font-medium text-white">
                {msg.Subject || '(no subject)'}
              </span>
              <span className="text-xs whitespace-nowrap text-gray-500">
                {new Date(msg.Timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-gray-400">
              {msg.Source} &rarr; {msg.Destination.ToAddresses.join(', ')}
            </div>
          </button>
        ))}
      </div>

      {selected && <EmailDetail msg={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
