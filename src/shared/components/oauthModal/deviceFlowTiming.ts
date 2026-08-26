/**
 * Parse a positive numeric value with fallback and enforce a minimum of 1.
 * Treats `0`, NaN, and non-numeric inputs as "use fallback".
 */
export function positiveNumberOr(value: unknown, fallback: number): number {
  return Math.max(1, Number(value) || fallback);
}

export function resolveDeviceFlowExpiresInSeconds(
  provider: string | undefined,
  expiresIn: unknown,
  interval: unknown
): number {
  const safeInterval = positiveNumberOr(interval, 5);
  const fallback = safeInterval * 60;

  if (provider !== "ghe-copilot") {
    return positiveNumberOr(expiresIn, fallback);
  }

  // Some GHE installations return very small expires_in values that behave like
  // "minutes" instead of OAuth device-flow seconds, which can terminate the UI
  // loop after a single 5s interval. Normalize to a practical lower bound while
  // still respecting upstream TTL when it's already in seconds.
  const parsed = Number(expiresIn);
  const gheMinimum = Math.max(fallback, 300);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return gheMinimum;
  }
  // Normalize suspiciously small TTL values that align with the poll cadence
  // (observed enterprise mis-unit: values like 5/10/15 intended as minutes
  // while interval=5 seconds).
  if (parsed < 60 && parsed % safeInterval === 0) {
    return Math.max(parsed * 60, gheMinimum);
  }
  return parsed;
}
