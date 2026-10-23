import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { config } from './config.ts';
import { logger } from './logger.ts';

let provider: NodeTracerProvider | undefined;

export function isTracingEnabled(): boolean {
  return config.LANGFUSE_PUBLIC_KEY !== undefined && config.LANGFUSE_SECRET_KEY !== undefined;
}

/**
 * Registers the Langfuse exporter as the global tracer. Without keys nothing
 * is registered and every @langfuse/tracing call is a no-op.
 */
export function startTracing(): void {
  if (!isTracingEnabled()) {
    logger.warn('Langfuse tracing: off, LANGFUSE_PUBLIC_KEY is not set');
    return;
  }

  // Spans are batched and sent in the background, so a slow or unreachable
  // Langfuse never holds up a Saral reply.
  provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: config.LANGFUSE_PUBLIC_KEY,
        secretKey: config.LANGFUSE_SECRET_KEY,
        baseUrl: config.LANGFUSE_BASE_URL,
        environment: config.NODE_ENV,
      }),
    ],
  });
  provider.register();
  logger.info({ baseUrl: config.LANGFUSE_BASE_URL }, 'Langfuse tracing: on');
}

/** Sends any spans still buffered. Called once requests have finished. */
export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown();
}
