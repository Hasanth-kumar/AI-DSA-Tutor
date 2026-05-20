export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product?: string;
    metadata?: { display_phone_number?: string; phone_number_id?: string };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: WhatsAppWebhookMessage[];
  };
  field: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: {
    id: string;
    changes: WhatsAppWebhookChange[];
  }[];
}
