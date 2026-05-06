export const colors = {
  ink: '#0F1B2D',
  body: '#1F2937',
  muted: '#6B7280',
  hairline: '#D1D5DB',
  pageBg: '#FFFFFF',
  accent: '#1E3A8A',
  accentSoft: '#E0E7FF',
  draft: '#9A3412',
} as const;

export type ThemeColor = keyof typeof colors;
