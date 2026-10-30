import '@shared/environment';

/** Los proveedores con adaptador. Sumar uno es escribir su adaptador y agregarlo acá. */
export const TEXT_GENERATION_PROVIDERS = ['groq', 'anthropic'] as const;
export type TextGenerationProvider = (typeof TEXT_GENERATION_PROVIDERS)[number];

const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

const effort = (value: string | undefined): ReasoningEffort =>
  REASONING_EFFORTS.find((candidate) => candidate === value?.trim().toLowerCase()) ?? 'medium';

const provider = (value: string | undefined): TextGenerationProvider =>
  TEXT_GENERATION_PROVIDERS.find((candidate) => candidate === value?.trim().toLowerCase()) ?? 'groq';

export default {
  /** Qué adaptador se usa. Por defecto Groq, que tiene un plan gratis. */
  Provider: provider(process.env.LLM_PROVIDER),
  Groq: {
    ApiKey: process.env.GROQ_API_KEY || undefined,
    /** Compatible con la API de OpenAI. */
    BaseUrl: (process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    Model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    /**
     * Cuanto razona `gpt-oss` antes de responder. Con `low` entendia mal reseñas ambiguas
     * ("facturas del dia anterior" como factura de compra); `medium` suma unos 0,3 s.
     */
    ReasoningEffort: effort(process.env.GROQ_REASONING_EFFORT),
  },
  Anthropic: {
    ApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    Model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  },
};
