import { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { fetchSnsPlatformMessages, fetchSnsSmsMessages } from '../api'

interface FlatMessage {
  id: string
  type: 'platform' | 'sms'
  target: string
  message: string
  subject?: string
  attributes: Record<string, unknown>
}

export default function SnsMessages() {
  const {
    data: platformData,
    error: platformErr,
    loading: platformLoading,
  } = usePolling(fetchSnsPlatformMessages, 5000)
  const {
    data: smsData,
    error: smsErr,
    loading: smsLoading,
  } = usePolling(fetchSnsSmsMessages, 5000)
  const [expanded, setExpanded] = useState<string | null>(null)

  const loading = platformLoading || smsLoading
  const error = platformErr || smsErr

  const messages: FlatMessage[] = []

  if (platformData?.platform_endpoint_messages) {
    for (const [arn, msgs] of Object.entries(platformData.platform_endpoint_messages)) {
      msgs.forEach((msg, i) => {
        messages.push({
          id: `platform-${arn}-${i}`,
          type: 'platform',
          target: msg.TargetArn || arn,
          message: msg.Message,
          subject: msg.Subject,
          attributes: msg.MessageAttributes,
        })
      })
    }
  }

  if (smsData?.sms_messages) {
    smsData.sms_messages.forEach((msg, i) => {
      messages.push({
        id: `sms-${i}`,
        type: 'sms',
        target: msg.PhoneNumber,
        message: msg.Message,
        attributes: msg.MessageAttributes,
      })
    })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span className="text-xl">&#128276;</span> SNS Messages
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {messages.length}
          </span>
        </h2>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-800 py-8 text-center text-sm text-gray-600">
          No SNS messages yet. Publish via{' '}
          <code className="rounded bg-gray-800 px-1 text-xs">aws sns publish</code>
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900"
          >
            <button
              onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
              className="w-full p-3 text-left transition-colors hover:bg-gray-800"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      msg.type === 'sms'
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-purple-900 text-purple-300'
                    }`}
                  >
                    {msg.type === 'sms' ? 'SMS' : 'PUSH'}
                  </span>
                  <span className="truncate text-sm text-white">
                    {msg.subject || msg.message.slice(0, 80)}
                  </span>
                </div>
              </div>
              <div className="mt-1 truncate text-xs text-gray-400">Target: {msg.target}</div>
            </button>
            {expanded === msg.id && (
              <div className="space-y-2 border-t border-gray-800 p-3">
                <pre className="rounded bg-gray-800 p-3 text-sm break-all whitespace-pre-wrap text-gray-200">
                  {tryFormatJson(msg.message)}
                </pre>
                {Object.keys(msg.attributes).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-gray-500">Attributes:</p>
                    <pre className="rounded bg-gray-800 p-2 text-xs text-gray-300">
                      {JSON.stringify(msg.attributes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
