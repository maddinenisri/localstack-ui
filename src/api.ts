import type { SesResponse, SnsPlatformMessages, SnsSmsResponse, HealthResponse } from './types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export const fetchSesMessages = () => fetchJson<SesResponse>('/_aws/ses')
export const fetchSnsPlatformMessages = () =>
  fetchJson<SnsPlatformMessages>('/_aws/sns/platform-endpoint-messages')
export const fetchSnsSmsMessages = () => fetchJson<SnsSmsResponse>('/_aws/sns/sms-messages')
export const fetchHealth = () => fetchJson<HealthResponse>('/_localstack/health')
