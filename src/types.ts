export interface SesMessage {
  Id: string
  Region: string
  Source: string
  Destination: {
    ToAddresses: string[]
    CcAddresses: string[]
    BccAddresses: string[]
  }
  Subject: string
  Body: {
    text_part?: string
    html_part?: string
  }
  Timestamp: string
  RawData?: string
}

export interface SesResponse {
  messages: SesMessage[]
}

export interface SnsPlatformMessages {
  platform_endpoint_messages: Record<string, SnsEndpointMessage[]>
}

export interface SnsEndpointMessage {
  TargetArn: string
  Message: string
  MessageAttributes: Record<string, unknown>
  MessageStructure: string
  Subject: string
}

export interface SnsSmsResponse {
  sms_messages: SnsSmsMessage[]
}

export interface SnsSmsMessage {
  PhoneNumber: string
  Message: string
  MessageAttributes: Record<string, unknown>
}

export interface HealthResponse {
  services: Record<string, string>
  features: Record<string, string>
  version: string
  edition: string
}
