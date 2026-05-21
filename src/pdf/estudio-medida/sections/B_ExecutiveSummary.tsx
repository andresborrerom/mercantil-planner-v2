/**
 * Sección B — Resumen Ejecutivo del Estudio a la Medida.
 *
 * Una página con 4 bloques: objetivo, estrategia recomendada, resultado
 * esperado, próximos pasos. Datos derivados del config + result.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { EstudioBrandBar } from '../components/EstudioBrandBar';
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
  block: {
    marginBottom: spacing.lg,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
  },
  blockHeader: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  blockBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    lineHeight: lineHeight.normal,
  },
  emph: {
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  kpiRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  kpiBox: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: 2,
  },
  kpiLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  kpiValue: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.bodyLarge,
    color: colors.navyDeep,
  },
});

type Props = {
  state: EstudioMedidaStateContainer;
};

export function ExecutiveSummarySection({ state }: Props) {
  const { config, result, client } = state;
  const horizonY = (config.horizonMonths / 12).toFixed(0);
  const allocBullet = (config.bulletTotalPct * 100).toFixed(0);
  const allocEquity = (config.equityPct * 100).toFixed(0);
  const allocCash = (config.cashPct * 100).toFixed(0);
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  const equityMixStr = config.equityMix
    .map((m) => `${Math.round((m.weight / equityMixTotal) * 100)}% ${m.ticker}`)
    .join(' / ');

  const objetivoText = client.type === 'juridica'
    ? `Diseñar y simular una asignación estratégica de inversión para el patrimonio de ${client.name}, con horizonte de ${horizonY} años y un capital inicial de ${fmtMoney(config.initialAumUsd)}, alineada al mandato institucional del cliente y a las condiciones actuales del mercado.`
    : `Diseñar y simular una estrategia personal de inversión para ${client.name}, con horizonte de ${horizonY} años y un capital inicial de ${fmtMoney(config.initialAumUsd)}, alineada a sus objetivos personales, tolerancia al riesgo y patrón esperado de aportes y retiros.`;

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Resumen Ejecutivo</Text>

      <View style={styles.block}>
        <Text style={styles.blockHeader}>Objetivo del estudio</Text>
        <Text style={styles.blockBody}>{objetivoText}</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockHeader}>Estrategia propuesta</Text>
        <Text style={styles.blockBody}>
          Allocation estratégico <Text style={styles.emph}>{allocBullet}% renta fija</Text> (escalera de bonos
          corporativos investment-grade con vencimientos escalonados), <Text style={styles.emph}>{allocEquity}% renta variable</Text>{' '}
          ({equityMixStr}) y <Text style={styles.emph}>{allocCash}% cash</Text> (BIL — T-Bills 1–3 meses).
          {config.rolloverEnabled
            ? ' La estrategia incluye rollover táctico basado en regímenes A/B/C de tasas (regla escrita, paired bootstrap, no discrecional).'
            : ' La estrategia es buy-and-hold sobre la escalera de bonos (sin rollover táctico).'}
          {config.loanEnabled
            ? ` Incorpora un apalancamiento bancario opcional disparado en el mes ${config.loanTriggerMonth} por hasta ${(config.loanAmountPctAum * 100).toFixed(0)}% del AUM y plazo ${config.loanTermMonths} meses.`
            : ''}
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockHeader}>Resultado esperado (simulación)</Text>
        {result ? (
          <>
            <Text style={styles.blockBody}>
              Sobre {result.meta.nSims.toLocaleString()} simulaciones del modelo, los indicadores principales son:
            </Text>
            <View style={styles.kpiRow}>
              <KpiBox label="Retorno anual mediano" value={fmtPct(result.stats.annNetMed)} />
              <KpiBox label="Banda P5–P95 anual" value={`${fmtPct(result.stats.annNetP5)} / ${fmtPct(result.stats.annNetP95)}`} />
              <KpiBox label="Prob. retorno > 0" value={fmtPct(result.stats.probPos, 0)} />
              <KpiBox label="AUM final mediano" value={fmtMoney(result.stats.finalAumMed)} />
            </View>
          </>
        ) : (
          <Text style={styles.blockBody}>
            Aún no se ha corrido la simulación para este estudio. Corra el motor en el panel del Caso de Estudio
            antes de generar el entregable final.
          </Text>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockHeader}>Próximos pasos</Text>
        <Text style={styles.blockBody}>
          1. Revisión del documento con el cliente y validación de los parámetros del estudio.{'\n'}
          2. {client.type === 'juridica'
            ? `Aprobación formal por parte ${client.governance ? `del ${client.governance.toLowerCase()}` : 'del órgano competente'} e incorporación de la política al IPS del fondo.`
            : 'Confirmación por el cliente de las directrices personales propuestas y de la cadencia de revisiones futuras.'}{'\n'}
          3. Implementación operativa y cronograma de seguimiento periódico (sugerido: revisión anual completa, monitoreo trimestral de ejecución).
        </Text>
      </View>
    </View>
  );
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiBox}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}
