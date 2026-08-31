export function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}
