import type { ErrorInfo } from 'react';

export interface ErrorReportContext {
  componentStack?: string;
  section?: string;
  severity?: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

const REPORT_ENDPOINT = process.env.REACT_APP_ERROR_ENDPOINT || '/api/monitoring/errors';

export const reportError = async (
  error: Error,
  info?: ErrorInfo,
  context: ErrorReportContext = {}
): Promise<void> => {
  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info?.componentStack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Always log locally for immediate debugging visibility
  // eslint-disable-next-line no-console
  console.error('AIDIS UI Error Captured', payload);

  if (!REPORT_ENDPOINT) {
    return;
  }

  try {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(REPORT_ENDPOINT, blob);
      return;
    }

    await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (networkError) {
    // eslint-disable-next-line no-console
    console.warn('Failed to report UI error', networkError);
  }
};
