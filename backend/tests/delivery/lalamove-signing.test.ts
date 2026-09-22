import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import { signLalamoveRequest } from '../../src/modules/delivery/providers/lalamove.signing';

describe('Lalamove request signing', () => {
  it('produces the documented Authorization header shape: "hmac <key>:<timestamp>:<hex signature>"', () => {
    const headers = signLalamoveRequest('pk_test_key', 'sk_test_secret', 'POST', '/v3/quotations', '{"a":1}', 1700000000000, 'req_abc');

    expect(headers.Authorization).toMatch(/^hmac pk_test_key:1700000000000:[0-9a-f]{64}$/);
    expect(headers.Market).toBe('PH');
    expect(headers['Request-ID']).toBe('req_abc');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('matches Lalamove\'s documented raw-signature construction exactly: `${timestamp}\\r\\n${method}\\r\\n${path}\\r\\n\\r\\n${body}`', () => {
    const method = 'POST';
    const path = '/v3/orders';
    const body = '{"data":{"quotationId":"q1"}}';
    const timestamp = 1690000000000;
    const secret = 'sk_live_verify';

    const expectedRaw = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
    const expectedSignature = createHmac('sha256', secret).update(expectedRaw).digest('hex');

    const headers = signLalamoveRequest('pk_live_verify', secret, method, path, body, timestamp, 'req_x');

    expect(headers.Authorization).toBe(`hmac pk_live_verify:${timestamp}:${expectedSignature}`);
  });

  it('uses an empty body in the signed string for a GET request', () => {
    const timestamp = 1700000000001;
    const secret = 'sk_get_test';
    const expectedRaw = `${timestamp}\r\nGET\r\n/v3/orders/abc\r\n\r\n`;
    const expectedSignature = createHmac('sha256', secret).update(expectedRaw).digest('hex');

    const headers = signLalamoveRequest('pk_get_test', secret, 'GET', '/v3/orders/abc', '', timestamp, 'req_get');

    expect(headers.Authorization).toBe(`hmac pk_get_test:${timestamp}:${expectedSignature}`);
  });

  it('is deterministic: identical inputs always produce the identical signature', () => {
    const args = ['key', 'secret', 'POST', '/v3/quotations', '{"x":1}', 1700000000002, 'req_1'] as const;
    expect(signLalamoveRequest(...args).Authorization).toBe(signLalamoveRequest(...args).Authorization);
  });

  it('changing the method changes the signature', () => {
    expect(signLalamoveRequest('key', 'secret', 'GET', '/v3/quotations', '', 1700000000003, 'req').Authorization).not.toBe(
      signLalamoveRequest('key', 'secret', 'DELETE', '/v3/quotations', '', 1700000000003, 'req').Authorization,
    );
  });

  it('changing the path changes the signature', () => {
    expect(signLalamoveRequest('key', 'secret', 'GET', '/v3/orders/a', '', 1700000000003, 'req').Authorization).not.toBe(
      signLalamoveRequest('key', 'secret', 'GET', '/v3/orders/b', '', 1700000000003, 'req').Authorization,
    );
  });

  it('changing the body changes the signature', () => {
    expect(signLalamoveRequest('key', 'secret', 'POST', '/v3/orders', '{"a":1}', 1700000000003, 'req').Authorization).not.toBe(
      signLalamoveRequest('key', 'secret', 'POST', '/v3/orders', '{"a":2}', 1700000000003, 'req').Authorization,
    );
  });

  it('changing the timestamp changes the signature', () => {
    expect(signLalamoveRequest('key', 'secret', 'GET', '/v3/orders', '', 1700000000003, 'req').Authorization).not.toBe(
      signLalamoveRequest('key', 'secret', 'GET', '/v3/orders', '', 1700000000004, 'req').Authorization,
    );
  });

  it('changing the secret changes the signature', () => {
    expect(signLalamoveRequest('key', 'secretA', 'GET', '/v3/orders', '', 1700000000003, 'req').Authorization).not.toBe(
      signLalamoveRequest('key', 'secretB', 'GET', '/v3/orders', '', 1700000000003, 'req').Authorization,
    );
  });

  it('never leaks the secret itself into any header value', () => {
    const headers = signLalamoveRequest('pk_x', 'sk_super_secret_value', 'GET', '/v3/orders', '', 1700000000005, 'req');
    expect(Object.values(headers).join(' ')).not.toContain('sk_super_secret_value');
  });
});
