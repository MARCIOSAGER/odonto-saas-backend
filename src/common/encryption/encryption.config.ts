export type FieldType = 'string' | 'string[]' | 'json';
export type HashNormalize = 'digits' | 'lowercase';

export interface EncryptedFieldConfig {
  field: string;
  type: FieldType;
  blindIndex?: string;
  hashNormalize?: HashNormalize;
}

export interface EncryptedModelConfig {
  model: string;
  fields: EncryptedFieldConfig[];
}

export const ENCRYPTED_FIELDS: EncryptedModelConfig[] = [
  // ==================== Fase 1: Credenciais ====================
  {
    model: 'Clinic',
    fields: [
      { field: 'smtp_pass', type: 'string' },
      { field: 'z_api_token', type: 'string' },
      { field: 'z_api_client_token', type: 'string' },
    ],
  },
  {
    model: 'ClinicAiSettings',
    fields: [{ field: 'ai_api_key', type: 'string' }],
  },
  {
    model: 'User',
    fields: [{ field: 'totp_secret', type: 'string' }],
  },

  // ==================== Fase 2: PII Pacientes ====================
  {
    model: 'Patient',
    fields: [
      { field: 'cpf', type: 'string', blindIndex: 'cpf_hash', hashNormalize: 'digits' },
      { field: 'phone', type: 'string', blindIndex: 'phone_hash', hashNormalize: 'digits' },
      { field: 'email', type: 'string', blindIndex: 'email_hash', hashNormalize: 'lowercase' },
      { field: 'address', type: 'string' },
      { field: 'notes', type: 'string' },
    ],
  },
  {
    model: 'Dentist',
    fields: [
      { field: 'phone', type: 'string', blindIndex: 'phone_hash', hashNormalize: 'digits' },
      { field: 'email', type: 'string' },
    ],
  },

  // ==================== Fase 3: Dados Médicos ====================
  {
    model: 'Anamnesis',
    fields: [
      { field: 'allergies', type: 'string[]' },
      { field: 'medications', type: 'string[]' },
      { field: 'conditions', type: 'string[]' },
      { field: 'contraindications', type: 'string[]' },
      { field: 'alerts', type: 'string[]' },
      { field: 'warnings', type: 'string[]' },
      { field: 'surgeries', type: 'string' },
      { field: 'risk_classification', type: 'string' },
      { field: 'ai_notes', type: 'string' },
      { field: 'ai_recommendations', type: 'string' },
      { field: 'habits', type: 'json' },
      { field: 'raw_answers', type: 'json' },
    ],
  },
  {
    model: 'Prescription',
    fields: [{ field: 'content', type: 'json' }],
  },
  {
    model: 'TreatmentPlan',
    fields: [
      { field: 'patient_summary', type: 'string' },
      { field: 'recommendations', type: 'string' },
      { field: 'notes', type: 'string' },
      { field: 'phases', type: 'json' },
    ],
  },
  {
    model: 'OdontogramEntry',
    fields: [{ field: 'notes', type: 'string' }],
  },
  {
    model: 'NpsSurvey',
    fields: [{ field: 'feedback', type: 'string' }],
  },

  // ==================== Fase 4: Conversas e Mensagens ====================
  {
    model: 'Conversation',
    fields: [{ field: 'messages', type: 'json' }],
  },
  {
    model: 'WhatsAppMessage',
    fields: [
      { field: 'phone', type: 'string', blindIndex: 'phone_hash', hashNormalize: 'digits' },
      { field: 'message', type: 'string' },
      { field: 'raw_payload', type: 'json' },
    ],
  },
  {
    model: 'ConversationLog',
    fields: [
      { field: 'message', type: 'string' },
      { field: 'response', type: 'string' },
    ],
  },

  // ==================== Fase 5: Audit Logs ====================
  {
    model: 'AuditLog',
    fields: [
      { field: 'ip_address', type: 'string' },
      { field: 'old_values', type: 'json' },
      { field: 'new_values', type: 'json' },
    ],
  },
];

export function getEncryptedFieldsForModel(modelName: string): EncryptedFieldConfig[] | undefined {
  const config = ENCRYPTED_FIELDS.find((c) => c.model === modelName);
  return config?.fields;
}
