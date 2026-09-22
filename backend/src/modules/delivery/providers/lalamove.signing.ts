/**
 * Lalamove Open API v3 request signing (HMAC-SHA256), per
 * https://developers.lalamove.com/ :
 *
 *   rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`
 *   signature    = HMAC-SHA256(rawSignature, apiSecret)  // lowercase hex
 *   Authorization: hmac <apiKey>:<timestamp>:<signature>
 *
 * Pure and network-free (unit-testable without hitting Lalamove), which is
 * also why it is its own module rather than inlined into the provider.
 */
import { createHmac } from 'crypto';

export interface LalamoveAuthHeaders {
  Authorization: string;
  Market: 'PH';
  'Request-ID': string;
  'Content-Type': 'application/json';
  [header: string]: string;
}

/** `path` is the request path only (e.g. "/v3/quotations") - no scheme/host, and no query string beyond what Lalamove expects signed. `body` is `''` for a GET/DELETE with no body. */
export const signLalamoveRequest = (
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  body: string,
  timestamp: number,
  requestId: string,
): LalamoveAuthHeaders => {
  const rawSignature = `${timestamp}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${body}`;
  const signature = createHmac('sha256', apiSecret).update(rawSignature).digest('hex');

  return {
    Authorization: `hmac ${apiKey}:${timestamp}:${signature}`,
    Market: 'PH',
    'Request-ID': requestId,
    'Content-Type': 'application/json',
  };
};
