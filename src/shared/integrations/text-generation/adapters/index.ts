/**
 * Puerto hacia un modelo de lenguaje. El dominio (por ejemplo, las respuestas sugeridas) arma
 * las instrucciones y depende solo de esto; cada proveedor tiene su adaptador, que traduce este
 * pedido al formato de su API. Cambiar de proveedor es cambiar de adaptador (`LLM_PROVIDER`), sin
 * tocar el dominio.
 */
export interface TextGenerationRequest {
  /** Instrucciones fijas: sin datos del pedido, así los proveedores que cachean las reutilizan. */
  system: string;
  /** Lo que varía en cada pedido. Si trae texto de terceros, el dominio lo marca como dato. */
  prompt: string;
  /** Tope de tokens de la respuesta. */
  maxTokens: number;
}

export type TextGenerationResult =
  | { status: 'ok'; text: string }
  /** El modelo declinó el pedido, o no devolvió texto utilizable. */
  | { status: 'empty'; reason: string };

export interface TextGenerationAdapter {
  /** Nombre del proveedor, para logs y diagnóstico. */
  readonly provider: string;
  /** `false` si el proveedor elegido no tiene credenciales: la función que lo usa no se ofrece. */
  readonly available: boolean;
  /**
   * Genera el texto. Un error de red, de cuota o del proveedor se propaga como excepción: quien
   * llama decide cómo mostrarlo.
   */
  generate(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export const TEXT_GENERATION_ADAPTER = Symbol('TEXT_GENERATION_ADAPTER');
