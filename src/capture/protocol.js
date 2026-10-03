/**
 * Capture Message Contract (M0 §25) — the only shared vocabulary between
 * the browser extension and the Reverie Capture Host.
 *
 * Every message carries protocol_version so the contract can evolve (v1,
 * v2, ...) without breaking older extensions/hosts.
 */
import { randomUUID } from 'node:crypto';

export const PROTOCOL_VERSION = 1;

/** Conservative size caps (bytes, UTF-8). Host→Chrome replies stay ≤ 1 MB
 * by protocol design; inbound we cap far below Chrome's 4 GB allowance. */
export const LIMITS = {
  url: 2048,
  title: 512,
  selected_text: 10_000,
  message: 1_048_576, // 1 MB per inbound message
};

export function createCaptureRequest({ url, title = '', selected_text = '' }) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: randomUUID(),
    url,
    title,
    selected_text,
    timestamp: new Date().toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Validate an inbound CaptureRequest. Never throws — returns a verdict. */
export function validateCaptureRequest(msg) {
  if (typeof msg !== 'object' || msg === null) {
    return { ok: false, error_code: 'malformed', message: 'message must be a JSON object' };
  }
  if (msg.protocol_version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error_code: 'version_mismatch',
      message: `protocol_version must be ${PROTOCOL_VERSION}`,
    };
  }
  if (typeof msg.request_id !== 'string' || !UUID_RE.test(msg.request_id)) {
    return { ok: false, error_code: 'malformed', message: 'request_id must be a UUID v4' };
  }
  if (typeof msg.url !== 'string' || !/^https?:\/\//i.test(msg.url)) {
    return { ok: false, error_code: 'bad_url', message: 'url must be http(s)' };
  }
  if (msg.url.length > LIMITS.url) {
    return { ok: false, error_code: 'too_large', message: `url exceeds ${LIMITS.url} bytes` };
  }
  if (msg.title !== undefined && (typeof msg.title !== 'string' || Buffer.byteLength(msg.title, 'utf8') > LIMITS.title)) {
    return { ok: false, error_code: 'too_large', message: `title exceeds ${LIMITS.title} bytes` };
  }
  if (msg.selected_text !== undefined &&
    (typeof msg.selected_text !== 'string' || Buffer.byteLength(msg.selected_text, 'utf8') > LIMITS.selected_text)) {
    return { ok: false, error_code: 'too_large', message: `selected_text exceeds ${LIMITS.selected_text} bytes` };
  }
  if (msg.timestamp !== undefined && typeof msg.timestamp !== 'string') {
    return { ok: false, error_code: 'malformed', message: 'timestamp must be a string' };
  }
  return { ok: true };
}

export function createResponse(requestId, { accepted, error_code = null, message = null }) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: requestId,
    accepted,
    error_code,
    message,
    received_at: new Date().toISOString(),
  };
}

/** Native messaging framing: uint32 little-endian length + UTF-8 JSON. */
export function frameMessage(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(payload.length, 0);
  return Buffer.concat([head, payload]);
}
