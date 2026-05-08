/**
 * Paleta corporativa Mercantil AWM aplicada al PDF.
 *
 * Las claves `accent` / `accentSoft` se mantienen como aliases a `navy` /
 * `navySoft` para no romper consumidores anteriores; los nuevos componentes
 * deben usar los nombres específicos (navy/orange/gold/positive/negative).
 */
export const colors = {
  // Paleta corporativa Mercantil
  navy: '#213A7D',
  navyDeep: '#1A2D62',
  navySoft: '#E8ECF7',
  orange: '#E97031',
  orangeDeep: '#C45A24',
  orangeSoft: '#FCE4D6',
  gold: '#C9A84C',
  goldSoft: '#F5EDD7',

  // Texto / superficies
  ink: '#0F1B2D',
  body: '#1F2937',
  muted: '#6B7280',
  hairline: '#D1D5DB',
  rule: '#9CA3AF',
  pageBg: '#FFFFFF',
  surfaceTint: '#F8FAFC',

  // Semánticos (delta favorable/desfavorable, banner draft)
  positive: '#15803D',
  negative: '#B91C1C',
  draft: '#9A3412',

  // Aliases back-compat
  accent: '#213A7D',
  accentSoft: '#E8ECF7',
} as const;

export type ThemeColor = keyof typeof colors;
