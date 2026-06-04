/**
 * Sección C — Snapshot del cliente y del estudio.
 *
 * Tabla con los parámetros materiales: capital, horizonte, flujos, bandas
 * de equity, préstamo (si aplica), seed/n_sims. Datos del config tal cual.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { EstudioBrandBar } from '../components/EstudioBrandBar';
import { fmtMoney, fmtMonths, fmtPct } from '../format';
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
  intro: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    lineHeight: lineHeight.normal,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gold,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.25,
    borderBottomColor: colors.hairline,
  },
  label: {
    width: 200,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.muted,
  },
  value: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.ink,
  },
});

type Props = {
  state: EstudioMedidaStateContainer;
};

export function SnapshotSection({ state }: Props) {
  const { config, client } = state;
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Snapshot del cliente y del estudio</Text>
      <Text style={styles.intro}>
        Tabla de parámetros materiales del estudio. Todos los valores aquí presentados son los efectivamente
        usados por el motor de simulación. Cualquier cambio implica regenerar este documento.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identificación</Text>
        <Row label="Nombre" value={client.name} />
        <Row
          label="Tipo de cliente"
          value={client.type === 'juridica' ? 'Persona Jurídica' : 'Persona Natural'}
        />
        {client.subtype && <Row label="Subtipo / Estructura" value={client.subtype} />}
        {client.age !== undefined && <Row label="Edad" value={`${client.age} años`} />}
        {client.governance && <Row label="Órgano decisor" value={client.governance} />}
        <Row label="Bucket Wealth Way" value={bucketLabel(client.bucket)} />
        <Row label="Residencia fiscal" value={residencyLabel(config.clientResidency)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Parámetros del estudio</Text>
        <Row label="Capital inicial (AUM)" value={fmtMoney(config.initialAumUsd)} />
        <Row label="Horizonte" value={`${fmtMonths(config.horizonMonths)} (${config.horizonMonths} meses)`} />
        <Row label="Aporte anual base" value={fmtMoney(config.inflowBaseAnnual)} />
        <Row label="Crecimiento del aporte" value={fmtPct(config.inflowGrowth)} />
        <Row label="Simulaciones (paths)" value={config.nSims.toLocaleString()} />
        <Row label="Semilla del bootstrap" value={String(config.seed)} />
        <Row
          label="All-in fee aplicado"
          value={
            config.allInFeeBps > 0
              ? `${config.allInFeeBps} bp/yr (${(config.allInFeeBps / 100).toFixed(2)}% anual) — stats netos`
              : 'Sin fee aplicado — stats brutos'
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Asignación estratégica</Text>
        <Row label="Issuer del ladder" value="iBonds UCITS (BlackRock) — 2026-2034 + sintéticos" />
        <Row label="Renta fija (escalera bonos)" value={fmtPct(config.bulletTotalPct, 0)} />
        <Row label="Renta variable" value={fmtPct(config.equityPct, 0)} />
        <Row label="Cash" value={fmtPct(config.cashPct, 0)} />
        <Row label="Banda dura equity (mín / máx)" value={`${fmtPct(config.eqtyMin, 0)} – ${fmtPct(config.eqtyMax, 0)}`} />
        <Row
          label="Mix de renta variable"
          value={config.equityMix
            .map((m) => `${Math.round((m.weight / equityMixTotal) * 100)}% ${m.ticker}`)
            .join(' · ')}
        />
        <Row label="Rollover táctico" value={config.rolloverEnabled ? 'Habilitado (regímenes A/B/C)' : 'Deshabilitado (buy-and-hold)'} />
        <Row label="Spread inicial bonos sobre Treasury" value={`${(config.initialSpread * 10000).toFixed(0)} bp`} />
      </View>

      {config.loanEnabled && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apalancamiento bancario</Text>
          <Row label="Mes de disparo" value={`Mes ${config.loanTriggerMonth}`} />
          <Row label="Monto" value={`${fmtPct(config.loanAmountPctAum, 0)} del AUM en t = disparo`} />
          <Row label="Plazo" value={`${config.loanTermMonths} meses`} />
        </View>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function bucketLabel(b: string): string {
  if (b === 'liquidity') return 'Liquidez (0–5 años)';
  if (b === 'longevity') return 'Longevidad (largo plazo)';
  if (b === 'legacy') return 'Legado (multi-generacional)';
  return b;
}

function residencyLabel(r: string): string {
  if (r === 'offshore') return 'Offshore (non-US Person) — solo UCITS';
  if (r === 'us-resident') return 'US-resident / US Person — UCITS + US-registered';
  return r;
}
