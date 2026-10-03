/**
 * Capture Message Contract v1 (M1 §4) — the only shared vocabulary between
 * browser front-ends and the Reverie Capture Host.
 *
 * Evolution rule: every message carries protocol_version. v1 supersedes the
 * M0 spike contract (which never shipped); fields added: source,
 * capture_mode, created_at (replaces timestamp), uppercase error codes.
 */
import { randomUUID } from 'node:crypto';

export const PROTOCOL_VERSION = 1;

export const CAPTURE_MODES = ['article']; // 'full_page' | 'selection' reserved, do not implement early
export const CAPTURE_SOURCES = ['browser', 'app', 'import'];

/** Stable machine-readable error codes (M1 §4) — UI must never parse messages. */
export const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  INVALID_URL: 'INVALID_URL',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PERSIST_FAILED: 'PERSIST_FAILED',
  ASSET_DOWNLOAD_FAILED: 'ASSET_DOWNLOAD_FAILED',
  DUPLICATE: 'DUPLICATE',
  SECURITY_REJECTED: 'SECURITY_REJECTED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

export const RESPONSE_STATUSES = Object.freeze({
  ACCEPTED: 'accepted',     // queued, will be processed
  PROCESSING: 'processing', // reserved for future live channels
  COMPLETED: 'completed',
  FAILED: 'failed',
  DUPLICATE: 'duplicate',
});

/** Conservative size caps (bytes, UTF-8). Inbound message cap 1 MB. */
export const LIMITS = Object.freeze({
  url: 2048,
  title: 512,
  selected_text: 10_000,
  message: 1_048_576,
});

export function createCaptureRequest({ url, title = '', source = 'browser', capture_mode = 'article', selected_text = '' }) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: randomUUID(),
    url,
    title,
    source,
    capture_mode,
    selected_text,
    created_at: new Date().toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Validate an inbound CaptureRequest. Never throws — returns a verdict. */
export function validateCaptureRequest(msg) {
  if (typeof msg !== 'object' || msg === null) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: 'message must be a JSON object' };
  }
  if (msg.protocol_version !== PROTOCOL_VERSION) {
    return { ok: false, error_code: ERROR_CODES.UNSUPPORTED_PROTOCOL, message: `protocol_version must be ${PROTOCOL_VERSION}` };
  }
  if (typeof msg.request_id !== 'string' || !UUID_RE.test(msg.request_id)) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: 'request_id must be a UUID v4' };
  }
  if (typeof msg.url !== 'string' || msg.url.length === 0) {
    return { ok: false, error_code: ERROR_CODES.INVALID_URL, message: 'url is required' };
  }
  if (msg.url.length > LIMITS.url) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: `url exceeds ${LIMITS.url} bytes` };
  }
  if (!/^https?:\/\//i.test(msg.url)) {
    return { ok: false, error_code: ERROR_CODES.INVALID_URL, message: 'only http(s) URLs are supported' };
  }
  if (msg.title !== undefined && (typeof msg.title !== 'string' || Buffer.byteLength(msg.title, 'utf8') > LIMITS.title)) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: `title exceeds ${LIMITS.title} bytes` };
  }
  if (msg.source !== undefined && !CAPTURE_SOURCES.includes(msg.source)) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: `source must be one of ${CAPTURE_SOURCES.join('|')}` };
  }
  if (msg.capture_mode !== undefined && !CAPTURE_MODES.includes(msg.capture_mode)) {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: `capture_mode must be one of ${CAPTURE_MODES.join('|')}` };
  }
  const created = msg.created_at ?? msg.timestamp; // timestamp = M0 spike field, still accepted
  if (created !== undefined && typeof created !== 'string') {
    return { ok: false, error_code: ERROR_CODES.INVALID_REQUEST, message: 'created_at must be a string' };
  }
  return { ok: true };
}

export function createResponse(requestId, { status, article_id = null, error_code = null, message = null }) {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: requestId,
    status,
    article_id,
    error_code,
    message,
    responded_at: new Date().toISOString(),
  };
}

/** Native messaging framing: uint32 little-endian length + UTF-8 JSON. */
export function frameMessage(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(payload.length, 0);
  return Buffer.concat([head, payload]);
}
