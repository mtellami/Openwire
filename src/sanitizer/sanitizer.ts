export interface SanitizeOptions {
  maxChars?: number;
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
}

export interface SanitizeResult {
  text: string;
  truncated: boolean;
}

const TRUNCATION_SUFFIX = "…[truncated]";
const NO_LIMIT = Number.POSITIVE_INFINITY;

/** Compact JSON within an exact serialized character budget. Limits are opt-in. */
export function sanitizeResponse(raw: string, options: SanitizeOptions): SanitizeResult {
  const maxChars = Math.floor(options.maxChars ?? NO_LIMIT);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const maxStringLength = options.maxStringLength ?? NO_LIMIT;
    let text =
      raw.length > maxStringLength ? raw.slice(0, maxStringLength) + TRUNCATION_SUFFIX : raw;
    if (text.length > maxChars) {
      const suffix = maxChars >= TRUNCATION_SUFFIX.length ? TRUNCATION_SUFFIX : "";
      text = text.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
    }
    return { text, truncated: text !== raw };
  }

  let truncated = false;
  function encode(value: unknown, budget: number, depth: number): string | undefined {
    if (depth > (options.maxDepth ?? NO_LIMIT)) {
      truncated = true;
      return undefined;
    }
    if (typeof value === "string") {
      let text = value;
      if (text.length > (options.maxStringLength ?? NO_LIMIT)) {
        text = text.slice(0, options.maxStringLength) + TRUNCATION_SUFFIX;
        truncated = true;
      }
      const encoded = JSON.stringify(text);
      if (encoded.length <= budget) return encoded;
      truncated = true;
      if (budget < 2) return undefined;
      const suffix = JSON.stringify(TRUNCATION_SUFFIX).length <= budget ? TRUNCATION_SUFFIX : "";
      // Search the prefix by its escaped JSON size, including quotes and marker.
      let low = 0;
      let high = Math.min(text.length, budget);
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (JSON.stringify(text.slice(0, mid) + suffix).length <= budget) low = mid;
        else high = mid - 1;
      }
      return JSON.stringify(text.slice(0, low) + suffix);
    }
    if (value === null || typeof value !== "object") {
      const encoded = JSON.stringify(value);
      if (encoded !== undefined && encoded.length <= budget) return encoded;
      truncated = true;
      return undefined;
    }
    if (budget < 2) {
      truncated = true;
      return undefined;
    }
    const array = Array.isArray(value);
    const parts: string[] = [];
    let remaining = budget - 2; // Reserve both container delimiters.
    const entries = array ? value.entries() : Object.entries(value);
    for (const [key, item] of entries) {
      if (array && Number(key) >= (options.maxArrayLength ?? NO_LIMIT)) {
        truncated = true;
        break;
      }
      const prefix = (parts.length ? "," : "") + (array ? "" : `${JSON.stringify(key)}:`);
      if (prefix.length >= remaining) {
        truncated = true;
        break;
      }
      const encoded = encode(item, remaining - prefix.length, depth + 1);
      if (encoded === undefined) {
        truncated = true;
        continue;
      }
      parts.push(prefix + encoded);
      remaining -= prefix.length + encoded.length;
    }
    return (array ? "[" : "{") + parts.join("") + (array ? "]" : "}");
  }

  const text = encode(parsed, maxChars, 0);
  return { text: text ?? "", truncated };
}
