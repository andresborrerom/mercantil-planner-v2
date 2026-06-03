/**
 * Sección F — Resultados de la simulación.
 *
 * Stats finales (table) + fan chart SVG del aumPath + regímenes A/B/C breakdown.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { EstudioBrandBar } from '../components/EstudioBrandBar';
import { EstudioFanChart } from '../components/EstudioFanChart';
import { fmtMoney, fmtPct } from '../format';
import type { EstudioMedidaStateContainer } from '../state/types';

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: pageMargin.horizontal,
    paddingBottom: pageMargin.vertical,
    backgroundColor: colors.pageBg,
    color: colors.body,
  },
  h2: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h2,
    color: colors.navy,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderTopWidth: 2,
    borderTopColor: colors.orange,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  statValue: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.bodyLarge,
    color: colors.navyDeep,
  },
  blockTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  blockBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    lineHeight: lineHeight.normal,
    marginBottom: spacing.md,
  },
  chartWrap: {
    marginVertical: spacing.md,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.hairline,
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
  },
  legendText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
  },
  regimeRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  regimeLabel: {
    width: 200,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navyDeep,
  },
  regimeValue: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
  },
  warn: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.orangeSoft,
    borderLeftWidth: 2,
    borderLeftColor: colors.orange,
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.draft,
    lineHeight: lineHeight.normal,
  },
});

type Props = {
  state: EstudioMedidaStateContainer;
};

export function ResultsSection({ state }: Props) {
  const { result, config } = state;

  if (!result) {
    return (
      <View style={styles.page}>
        <EstudioBrandBar state={state} />
        <Text style={styles.h2}>Resultados de la simulación</Text>
        <Text style={styles.blockBody}>
          No se incluyó resultado de simulación en este estudio. Corra el motor desde el panel de Caso de Estudio
          y regenere el documento para ver stats, fan chart y análisis de regímenes.
        </Text>
      </View>
    );
  }

  const totalEvents = result.regimeCounts.A + result.regimeCounts.B + result.regimeCounts.C;
  const pctA = totalEvents > 0 ? (result.regimeCounts.A / totalEvents) * 100 : 0;
  const pctB = totalEvents > 0 ? (result.regimeCounts.B / totalEvents) * 100 : 0;
  const pctC = totalEvents > 0 ? (result.regimeCounts.C / totalEvents) * 100 : 0;

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Resultados de la simulación</Text>

      <View style={styles.statsRow}>
        <StatBox label="Retorno anual mediano" value={fmtPct(result.stats.annNetMed)} />
        <StatBox label="Banda P5–P95 anual" value={`${fmtPct(result.stats.annNetP5)} / ${fmtPct(result.stats.annNetP95)}`} />
        <StatBox label="Prob. retorno > 0" value={fmtPct(result.stats.probPos, 0)} />
        <StatBox label="AUM final mediano" value={fmtMoney(result.stats.finalAumMed)} />
      </View>

      <Text style={styles.blockTitle}>Proyección del AUM — percentiles ($ millones)</Text>
      <Text style={styles.blockBody}>
        Bandas P5–P95 (90% de los caminos posibles) y P25–P75 (50%) sobre {result.meta.nSims.toLocaleString()} simulaciones del modelo.
        Línea sólida = mediana. Línea gris punteada = capital inicial ({fmtMoney(config.initialAumUsd)}).
      </Text>
      <View style={styles.chartWrap}>
        <EstudioFanChart
          aumPath={result.aumPath}
          nSims={result.meta.nSims}
          horizonMonths={result.meta.horizonMonths}
          initialAum={result.stats.initialAum}
        />
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.orange, opacity: 0.12 }]} />
            <Text style={styles.legendText}>P5–P95</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.orange, opacity: 0.28 }]} />
            <Text style={styles.legendText}>P25–P75</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.orangeDeep }]} />
            <Text style={styles.legendText}>Mediana</Text>
          </View>
        </View>
      </View>

      {config.rolloverEnabled && totalEvents > 0 && (
        <View wrap={false}>
          <Text style={[styles.blockTitle, { marginTop: spacing.md }]}>
            Distribución de regímenes del rollover táctico
          </Text>
          <Text style={styles.blockBody}>
            {totalEvents.toLocaleString()} eventos de vencimiento de bullets × simulación. La distribución refleja
            qué tipo de mercado dominó a lo largo del horizonte simulado.
          </Text>
          <View style={styles.regimeRow}>
            <Text style={styles.regimeLabel}>A · tasas altas + steep</Text>
            <Text style={styles.regimeValue}>{result.regimeCounts.A.toLocaleString()} eventos ({pctA.toFixed(1)}%)</Text>
          </View>
          <View style={styles.regimeRow}>
            <Text style={styles.regimeLabel}>B · tasas bajas o flat/inv.</Text>
            <Text style={styles.regimeValue}>{result.regimeCounts.B.toLocaleString()} eventos ({pctB.toFixed(1)}%)</Text>
          </View>
          <View style={styles.regimeRow}>
            <Text style={styles.regimeLabel}>C · zona neutral</Text>
            <Text style={styles.regimeValue}>{result.regimeCounts.C.toLocaleString()} eventos ({pctC.toFixed(1)}%)</Text>
          </View>
        </View>
      )}

      <Text style={styles.warn}>
        Recordatorio: los percentiles representan rangos estadísticos del modelo bajo las asunciones de la simulación,
        no garantías. {config.allInFeeBps > 0
          ? `Los retornos reportados son NETOS del all-in fee de ${config.allInFeeBps} bp anual (${(config.allInFeeBps / 100).toFixed(2)}%) que cubre TER de los ETFs subyacentes, custodia, asesoría e intermediación.`
          : 'Los retornos están expresados en términos brutos (sin deducción de TER, custodia, asesoría ni intermediación).'}{' '}
        Ver Apéndice — Advertencias regulatorias para el detalle completo de la metodología y limitaciones.
      </Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}
