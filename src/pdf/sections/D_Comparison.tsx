/**
 * Sección D — Comparativo Portafolio A vs B.
 *
 * Replica al StatsPanel de la herramienta dentro del PDF entregable: tabla
 * lado a lado A | B | Δ con las 9 métricas obligatorias del §6 del spec, sobre
 * la ventana del plan persistida en el state container.
 *
 * Las métricas se reciben pre-computadas desde el store del planner (no se
 * recomputan acá) — `WindowMetrics` es la misma estructura que consume el
 * StatsPanel del UI, así que cualquier consistencia o bug se manifiesta en
 * ambos lugares simultáneamente.
 */

import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import type { Band, WindowMetrics } from '../../domain/metrics';
import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import { BrandBar } from '../components/BrandBar';
import type { PdfStateContainer } from '../state/types';

const styles = StyleSheet.create({
  pageWrapper: { flex: 1 },
  page: {
    flex: 1,
    paddingHorizontal: pageMargin.horizontal,
    paddingBottom: pageMargin.vertical,
    backgroundColor: colors.pageBg,
    color: colors.body,
  },
  header: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    color: colors.navy,
    marginBottom: spacing.xs,
    lineHeight: lineHeight.tight,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.muted,
    marginBottom: spacing.lg,
    lineHeight: lineHeight.normal,
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: colors.gold,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    backgroundColor: colors.navySoft,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
  },
  rowLast: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  metricCell: {
    width: 170,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.ink,
  },
  headerMetricCell: {
    width: 170,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  valueCell: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
  },
  valueMain: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.ink,
  },
  valueBand: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: 1,
  },
  headerValueCell: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  deltaCellPositive: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.positive,
  },
  deltaCellNegative: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.negative,
  },
  deltaCellNeutral: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  footnote: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: spacing.sm,
    lineHeight: lineHeight.normal,
  },
  interpretationBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.navySoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.navy,
  },
  interpretationTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navyDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  interpretationBody: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    color: colors.ink,
    lineHeight: lineHeight.normal,
  },
});

type Props = {
  state: PdfStateContainer;
  metricsA: WindowMetrics;
  metricsB: WindowMetrics;
};

type Polarity = 'higherIsBetter' | 'lowerIsBetter';
type Format = 'pct' | 'pctSigned' | 'usd' | 'numberSigned' | 'count';

type MetricRow = {
  /** i18n key con la etiqueta humana (sin prefijo `pdf.comparison.metric.`). */
  labelKey:
    | 'twr'
    | 'xirr'
    | 'maxDD'
    | 'negMonths'
    | 'vol'
    | 'worst12m'
    | 'finalValue'
    | 'ruinProb'
    | 'shortfallProb';
  /** Valor para A (banda con p10/p50/p90) o número escalar. null = N/A. */
  a: Band | number | null;
  b: Band | number | null;
  format: Format;
  polarity: Polarity;
  /** Mostrar la banda P10–P90 debajo del valor mediano. */
  showBand: boolean;
};

function fmtPct(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtPctSigned(v: number, digits = 2): string {
  const formatted = `${(v * 100).toFixed(digits)}%`;
  return v > 0 ? `+${formatted}` : formatted;
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000)
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtCount(v: number): string {
  return v.toFixed(2);
}

function formatValue(v: number | null, format: Format): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (format) {
    case 'pct':
      return fmtPct(v);
    case 'pctSigned':
      return fmtPctSigned(v);
    case 'usd':
      return fmtUsd(v);
    case 'numberSigned':
      return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
    case 'count':
      return fmtCount(v);
  }
}

function bandText(b: Band, format: Format): string {
  return `(${formatValue(b.p10, format)} – ${formatValue(b.p90, format)})`;
}

function median(value: Band | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return value.p50;
}

function deltaCellStyle(
  delta: number | null,
  polarity: Polarity,
): typeof styles.deltaCellPositive {
  if (delta == null || !Number.isFinite(delta)) return styles.deltaCellNeutral;
  const epsilon = 1e-9;
  if (Math.abs(delta) < epsilon) return styles.deltaCellNeutral;
  const isFavorable =
    polarity === 'higherIsBetter' ? delta > 0 : delta < 0;
  return isFavorable ? styles.deltaCellPositive : styles.deltaCellNegative;
}

function formatDelta(delta: number | null, format: Format): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  switch (format) {
    case 'pct':
    case 'pctSigned':
      return fmtPctSigned(delta);
    case 'usd':
      return delta >= 0 ? `+${fmtUsd(delta)}` : fmtUsd(delta);
    case 'count':
    case 'numberSigned':
      return delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
  }
}

function buildRows(
  a: WindowMetrics,
  b: WindowMetrics,
): MetricRow[] {
  return [
    {
      labelKey: 'twr',
      a: a.twrAnnualized,
      b: b.twrAnnualized,
      format: 'pct',
      polarity: 'higherIsBetter',
      showBand: true,
    },
    {
      labelKey: 'xirr',
      a: a.xirrAnnualized,
      b: b.xirrAnnualized,
      format: 'pct',
      polarity: 'higherIsBetter',
      showBand: true,
    },
    {
      labelKey: 'maxDD',
      a: a.maxDrawdown,
      b: b.maxDrawdown,
      format: 'pct',
      polarity: 'higherIsBetter', // menos negativo = mejor → "higher" sobre [-1,0]
      showBand: true,
    },
    {
      labelKey: 'negMonths',
      a: a.negMonthsPerYear,
      b: b.negMonthsPerYear,
      format: 'count',
      polarity: 'lowerIsBetter',
      showBand: true,
    },
    {
      labelKey: 'vol',
      a: a.volatilityAnnualized,
      b: b.volatilityAnnualized,
      format: 'pct',
      polarity: 'lowerIsBetter',
      showBand: true,
    },
    {
      labelKey: 'worst12m',
      a: a.worstRolling12m,
      b: b.worstRolling12m,
      format: 'pct',
      polarity: 'higherIsBetter', // menos negativo = mejor
      showBand: true,
    },
    {
      labelKey: 'finalValue',
      a: a.finalValue,
      b: b.finalValue,
      format: 'usd',
      polarity: 'higherIsBetter',
      showBand: true,
    },
    {
      labelKey: 'ruinProb',
      a: a.ruinProbability,
      b: b.ruinProbability,
      format: 'pct',
      polarity: 'lowerIsBetter',
      showBand: false,
    },
    {
      labelKey: 'shortfallProb',
      a: a.shortfallProbability,
      b: b.shortfallProbability,
      format: 'pct',
      polarity: 'lowerIsBetter',
      showBand: false,
    },
  ];
}

export function ComparisonSection({ state, metricsA, metricsB }: Props) {
  const { t } = useTranslation();
  const rows = buildRows(metricsA, metricsB);
  const window = state.planner.window;
  const years = ((window.endMonth - window.startMonth + 1) / 12).toFixed(1);

  return (
    <View style={styles.pageWrapper}>
      <BrandBar state={state} />
      <View style={styles.page}>
        <Text style={styles.header}>{state.client.name}</Text>
        <Text style={styles.title}>{t('pdf.comparison.title')}</Text>
        <Text style={styles.subtitle}>
          {t('pdf.comparison.subtitle', {
            start: window.startMonth,
            end: window.endMonth,
            years,
          })}
        </Text>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={styles.headerMetricCell}>
              {t('pdf.comparison.header.metric')}
            </Text>
            <Text style={styles.headerValueCell}>
              {t('pdf.comparison.header.portfolioA')}
            </Text>
            <Text style={styles.headerValueCell}>
              {t('pdf.comparison.header.portfolioB')}
            </Text>
            <Text style={styles.headerValueCell}>
              {t('pdf.comparison.header.delta')}
            </Text>
          </View>

          {rows.map((row, idx) => {
            const isLast = idx === rows.length - 1;
            const aMed = median(row.a);
            const bMed = median(row.b);
            const delta = aMed != null && bMed != null ? bMed - aMed : null;
            const showBandRow =
              row.showBand &&
              row.a != null &&
              row.b != null &&
              typeof row.a !== 'number' &&
              typeof row.b !== 'number';

            const labelText = t(`pdf.comparison.metric.${row.labelKey}`);
            const aMissing =
              row.a == null && row.labelKey === 'worst12m'
                ? t('pdf.comparison.noWorst12m')
                : '—';

            return (
              <View key={row.labelKey} style={isLast ? styles.rowLast : styles.row} wrap={false}>
                <Text style={styles.metricCell}>{labelText}</Text>

                <View style={styles.valueCell}>
                  <Text style={styles.valueMain}>
                    {aMed != null ? formatValue(aMed, row.format) : aMissing}
                  </Text>
                  {showBandRow && row.a != null && typeof row.a !== 'number' ? (
                    <Text style={styles.valueBand}>{bandText(row.a, row.format)}</Text>
                  ) : null}
                </View>

                <View style={styles.valueCell}>
                  <Text style={styles.valueMain}>
                    {bMed != null ? formatValue(bMed, row.format) : aMissing}
                  </Text>
                  {showBandRow && row.b != null && typeof row.b !== 'number' ? (
                    <Text style={styles.valueBand}>{bandText(row.b, row.format)}</Text>
                  ) : null}
                </View>

                <Text style={deltaCellStyle(delta, row.polarity)}>
                  {formatDelta(delta, row.format)}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.footnote}>
          {t('pdf.comparison.bandFootnote')} {t('pdf.comparison.ruinFootnote')}
        </Text>

        <View style={styles.interpretationBox}>
          <Text style={styles.interpretationTitle}>
            {t('pdf.comparison.interpretation.title')}
          </Text>
          <Text style={styles.interpretationBody}>
            {t('pdf.comparison.interpretation.body')}
          </Text>
        </View>
      </View>
    </View>
  );
}
