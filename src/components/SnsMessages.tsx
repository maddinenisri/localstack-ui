import { useState, useEffect, useRef } from 'react'
import {
  ensureInspectorQueue,
  listSnsTopics,
  subscribeQueueToTopic,
  getQueueArn,
  receiveMessages,
  type SnsPublishedMessage,
} from '../api'

export default function SnsMessages() {
  const [messages, setMessages] = useState<SnsPublishedMessage[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const queueUrlRef = useRef('')

  // Set up the inspector queue and subscribe to all topics
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const queueUrl = await ensureInspectorQueue()
        if (cancelled) return
        queueUrlRef.current = queueUrl

        const queueArn = await getQueueArn(queueUrl)
        const topicArns = await listSnsTopics()
        if (cancelled) return
        setTopics(topicArns)

        for (const arn of topicArns) {
          await subscribeQueueToTopic(arn, queueArn)
        }
        if (cancelled) return
        setError(null)
        setReady(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Poll for new messages once ready
  useEffect(() => {
    if (!ready) return

    const poll = async () => {
      const queueUrl = queueUrlRef.current
      if (!queueUrl) return
      try {
        const newMsgs = await receiveMessages(queueUrl)
        if (newMsgs.length > 0) {
          setMessages((prev) => [...newMsgs, ...prev])
        }

        // Re-check for new topics
        const topicArns = await listSnsTopics()
        setTopics((prev) => {
          if (topicArns.length !== prev.length) {
            // Subscribe new topics in background
            getQueueArn(queueUrl).then((queueArn) => {
              for (const arn of topicArns) {
                subscribeQueueToTopic(arn, queueArn).catch(() => {})
              }
            })
            return topicArns
          }
          return prev
        })
      } catch (err) {
        console.error('SNS poll error:', err)
      }
    }

    // Poll immediately, then every 3s
    poll()
    const timer = setInterval(poll, 3000)
    return () => clearInterval(timer)
  }, [ready])

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span className="text-xl">&#128276;</span> SNS Messages
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {messages.length}
          </span>
        </h2>
        {topics.length > 0 && (
          <div className="hidden gap-1.5 sm:flex">
            {topics.map((arn) => (
              <span
                key={arn}
                className="rounded bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300"
              >
                {arn.split(':').pop()}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && messages.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-800 py-8 text-center text-sm text-gray-600">
          No SNS messages yet. Publish via{' '}
          <code className="rounded bg-gray-800 px-1 text-xs">aws sns publish</code>
          {topics.length > 0 && (
            <p className="mt-2 text-xs text-gray-700">
              Listening on {topics.length} topic{topics.length > 1 ? 's' : ''} via SQS inspector
              queue
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg, i) => (
          <div
            key={`${msg.messageId}-${i}`}
            className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900"
          >
            <button
              onClick={() =>
                setExpanded(expanded === `${msg.messageId}-${i}` ? null : `${msg.messageId}-${i}`)
              }
              className="w-full p-3 text-left transition-colors hover:bg-gray-800"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-purple-900 px-1.5 py-0.5 text-xs font-medium text-purple-300">
                    {msg.topicArn.split(':').pop() || 'SNS'}
                  </span>
                  <span className="truncate text-sm text-white">
                    {msg.subject || msg.message.slice(0, 80)}
                  </span>
                </div>
                {msg.timestamp && (
                  <span className="text-xs whitespace-nowrap text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </button>
            {expanded === `${msg.messageId}-${i}` && (
              <div className="space-y-2 border-t border-gray-800 p-3">
                <div className="space-y-1 text-xs text-gray-400">
                  <p>
                    <span className="text-gray-500">Topic:</span> {msg.topicArn}
                  </p>
                  <p>
                    <span className="text-gray-500">Message ID:</span> {msg.messageId}
                  </p>
                </div>
                <pre className="rounded bg-gray-800 p-3 text-sm break-all whitespace-pre-wrap text-gray-200">
                  {tryFormatJson(msg.message)}
                </pre>
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
