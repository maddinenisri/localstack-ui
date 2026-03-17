import type { SesResponse, HealthResponse } from './types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export const fetchSesMessages = () => fetchJson<SesResponse>('/_aws/ses')
export const fetchHealth = () => fetchJson<HealthResponse>('/_localstack/health')

// SNS: use the standard AWS query API through the proxy.
// LocalStack accepts unsigned requests so we can call directly.

export interface SnsPublishedMessage {
  topicArn: string
  messageId: string
  subject?: string
  message: string
  timestamp?: string
}

const INSPECTOR_QUEUE = '_localstack-ui-inspector'

async function awsQuery(service: string, params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams(params).toString()
  const res = await fetch(`/_aws_api/${service}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status}: ${text}`)
  }
  return res.text()
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml')
}

function xmlText(doc: Document | Element, tag: string): string {
  return doc.getElementsByTagName(tag)[0]?.textContent ?? ''
}

function xmlTexts(doc: Document | Element, tag: string): string[] {
  return Array.from(doc.getElementsByTagName(tag)).map((el) => el.textContent ?? '')
}

export async function ensureInspectorQueue(): Promise<string> {
  // Create the inspector SQS queue (idempotent)
  const createRes = await awsQuery('sqs', {
    Action: 'CreateQueue',
    QueueName: INSPECTOR_QUEUE,
  })
  const doc = parseXml(createRes)
  return xmlText(doc, 'QueueUrl')
}

export async function listSnsTopics(): Promise<string[]> {
  const res = await awsQuery('sns', { Action: 'ListTopics' })
  const doc = parseXml(res)
  return xmlTexts(doc, 'TopicArn')
}

export async function subscribeQueueToTopic(topicArn: string, queueArn: string): Promise<void> {
  // Check existing subscriptions first
  const listRes = await awsQuery('sns', {
    Action: 'ListSubscriptionsByTopic',
    TopicArn: topicArn,
  })
  const doc = parseXml(listRes)
  const endpoints = xmlTexts(doc, 'Endpoint')
  if (endpoints.includes(queueArn)) return // already subscribed

  await awsQuery('sns', {
    Action: 'Subscribe',
    TopicArn: topicArn,
    Protocol: 'sqs',
    Endpoint: queueArn,
  })
}

export async function getQueueArn(queueUrl: string): Promise<string> {
  const res = await awsQuery('sqs', {
    Action: 'GetQueueAttributes',
    QueueUrl: queueUrl,
    'AttributeName.1': 'QueueArn',
  })
  const doc = parseXml(res)
  // Find the Value element inside Attribute
  const attrs = doc.getElementsByTagName('Attribute')
  for (const attr of Array.from(attrs)) {
    if (xmlText(attr, 'Name') === 'QueueArn') {
      return xmlText(attr, 'Value')
    }
  }
  return ''
}

export async function receiveMessages(queueUrl: string): Promise<SnsPublishedMessage[]> {
  const res = await awsQuery('sqs', {
    Action: 'ReceiveMessage',
    QueueUrl: queueUrl,
    MaxNumberOfMessages: '10',
    WaitTimeSeconds: '0',
  })
  const doc = parseXml(res)
  const members = doc.getElementsByTagName('Message')
  const messages: SnsPublishedMessage[] = []

  for (const member of Array.from(members)) {
    const receiptHandle = xmlText(member, 'ReceiptHandle')
    const rawBody = xmlText(member, 'Body')

    // Delete the message from the queue after reading
    if (receiptHandle) {
      awsQuery('sqs', {
        Action: 'DeleteMessage',
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }).catch(() => {})
    }

    try {
      const body = JSON.parse(rawBody)
      messages.push({
        topicArn: body.TopicArn ?? '',
        messageId: body.MessageId ?? xmlText(member, 'MessageId'),
        subject: body.Subject || undefined,
        message: body.Message ?? rawBody,
        timestamp: body.Timestamp,
      })
    } catch {
      messages.push({
        topicArn: '',
        messageId: xmlText(member, 'MessageId'),
        message: rawBody,
      })
    }
  }

  return messages
}
