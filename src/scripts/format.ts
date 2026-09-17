/**
 * Formateo de moneda ARS y helpers compartidos del lado cliente.
 * Convenciones: separador de miles con punto, sin decimales.
 */

const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
});

export function formatARS(amount: number): string {
  if (!Number.isFinite(amount)) return '$ 0';
  return `$ ${ARS_FORMATTER.format(Math.round(amount))}`;
}

export function formatInstallments(totalAmount: number): string {
  if (totalAmount <= 0) return '';
  const perCuota = Math.round(totalAmount / 3);
  return `3 cuotas sin interés de ${formatARS(perCuota)}`;
}
