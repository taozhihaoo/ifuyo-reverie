import { randomUUID } from 'node:crypto';

/** UUID v4, lowercase — the only ID format used across the library format. */
export const newId = () => randomUUID();

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isId = (v) => typeof v === 'string' && ID_RE.test(v);
