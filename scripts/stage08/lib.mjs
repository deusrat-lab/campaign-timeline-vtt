// Stage 8 parity harness — shared helpers.
// Pure Node, no app dependencies. Imports the universal domain from the
// standalone-compiled ./.dist tree (see build-domain.mjs / tsconfig.harness.json).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

// Deterministic, order-preserving stable stringify (matches domain serialization).
export function stableStringify(value) {
  return JSON.stringify(sortForSerialization(value));
}

function sortForSerialization(value) {
  if (Array.isArray(value)) return value.map(sortForSerialization);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = sortForSerialization(value[key]);
  }
  return out;
}

export function hashJson(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

// Semantic deep-equality, order-preserving (round-trip must preserve order).
export function stableEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

// Recursively collect every string value reachable in an object (for privacy
// leak scanning by concrete forbidden strings).
export function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

// Recursively collect every object-key path present (for forbidden field-path checks).
export function collectKeyPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeyPaths(item, `${prefix}[]`, out));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(key);
      collectKeyPaths(value[key], path, out);
    }
  }
  return out;
}

export class Checks {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }
  ok(name, condition, detail) {
    const pass = Boolean(condition);
    if (pass) this.passed += 1;
    else this.failed += 1;
    this.results.push({ name, pass, detail: pass ? undefined : detail ?? 'assertion failed' });
    return pass;
  }
  eq(name, actual, expected) {
    return this.ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  throws(name, fn, codeOrTest) {
    try {
      fn();
      return this.ok(name, false, 'expected throw but none occurred');
    } catch (error) {
      if (!codeOrTest) return this.ok(name, true);
      if (typeof codeOrTest === 'function') return this.ok(name, codeOrTest(error), `throw did not match predicate: ${String(error?.message ?? error)}`);
      const code = error?.code ?? error?.name;
      return this.ok(name, code === codeOrTest || String(error?.message ?? '').includes(codeOrTest), `expected ${codeOrTest}, got ${code ?? error?.message}`);
    }
  }
  summary() {
    return { passed: this.passed, failed: this.failed, total: this.passed + this.failed, ok: this.failed === 0 };
  }
}
