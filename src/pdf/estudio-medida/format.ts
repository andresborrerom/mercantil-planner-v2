/**
 * Formatters compartidos entre las secciones del PDF "Estudio a la Medida".
 * Centralizados acá para que portada, secciones y disclaimers usen el mismo
 * formato monetario / porcentual.
 */
export function fmtMoney(usd: number): string {
  if (!Number.isFinite(usd)) return '—';
  if (Math.abs(usd) >= 1e6) return `USD ${(usd / 1e6).toFixed(2)}M`;
  if (Math.abs(usd) >= 1e3) return `USD ${(usd / 1e3).toFixed(0)}k`;
  return `USD ${usd.toFixed(0)}`;
}

export function fmtPct(decimal: number, digits = 2): string {
  if (!Number.isFinite(decimal)) return '—';
  return `${(decimal * 100).toFixed(digits)}%`;
}

export function fmtMonths(m: number): string {
  if (!Number.isFinite(m)) return '—';
  const y = m / 12;
  return Number.isInteger(y) ? `${y} años` : `${y.toFixed(1)} años`;
}
