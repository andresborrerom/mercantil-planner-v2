/**
 * Sección E — Estrategia detallada del estudio.
 *
 * Cubre los 3 sleeves + rollover táctico. El equity mix se imprime con
 * sus pesos normalizados y, si hay tickers con proxy (SPMO/CAPE), aparece
 * un aviso de splice histórico que apunta al disclaimer correspondiente
 * en la sección de Apéndice.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { EstudioBrandBar } from '../components/EstudioBrandBar';
import { fmtPct } from '../format';
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
  sleeveCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderLeftWidth: 3,
    borderLeftColor: colors.navy,
  },
  sleeveTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.bodyLarge,
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  sleeveMeta: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sleeveBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    lineHeight: lineHeight.normal,
  },
  tickerRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.25,
    borderBottomColor: colors.hairline,
  },
  tickerSymbol: {
    width: 60,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navyDeep,
  },
  tickerWeight: {
    width: 60,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.orange,
  },
  tickerDesc: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
  },
  caveat: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.draft,
    marginTop: 2,
  },
  regimeCard: {
    flex: 1,
    padding: spacing.sm,
    marginRight: spacing.xs,
    backgroundColor: colors.pageBg,
    borderLeftWidth: 2,
  },
  regimeTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    marginBottom: spacing.xs,
  },
  regimeBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.body,
    lineHeight: lineHeight.normal,
  },
});

// Catálogo mínimo de descripciones por ticker (para que el PDF sea autónomo
// si el meta JSON no está disponible al momento de generar). Se prioriza el
// catálogo del config si está presente; este es el fallback canónico.
const TICKER_INFO: Record<string, { name: string; description: string; proxy?: string; caveats?: string[] }> = {
  USMV: { name: 'iShares MSCI USA Min Vol Factor ETF', description: 'Baja volatilidad — MSCI USA Min Vol.' },
  SCHD: { name: 'Schwab US Dividend Equity ETF', description: 'Dividendo de calidad — screen fundamental + 10y+ dividend history.' },
  SPLV: { name: 'Invesco S&P 500 Low Volatility ETF', description: 'Baja vol alternativa — S&P 500 Low Volatility.' },
  NOBL: { name: 'ProShares S&P 500 Dividend Aristocrats ETF', description: 'Aristócratas — 25y+ subiendo dividendos.' },
  SPHQ: { name: 'Invesco S&P 500 Quality ETF', description: 'Quality — alta ROE y baja deuda.' },
  SPYD: { name: 'SPDR Portfolio S&P 500 High Dividend ETF', description: 'Dividendo alto — top 80 por yield del S&P 500.' },
  OEF: { name: 'iShares S&P 100 ETF', description: 'Mega-cap — 100 mayores empresas US.' },
  QQQ: { name: 'Invesco QQQ Trust', description: 'Growth — NASDAQ-100, tech mega-cap.', caveats: ['Concentración sectorial alta (~50% tech).'] },
  IJR: { name: 'iShares Core S&P Small-Cap ETF', description: 'Small-cap — S&P SmallCap 600.', caveats: ['Vol más alta que large caps.'] },
  RSP: { name: 'Invesco S&P 500 Equal Weight ETF', description: 'Equal weight — S&P 500 ponderado igual.' },
  SPMO: { name: 'Invesco S&P 500 Momentum ETF', description: 'Momentum — factor de momentum del S&P 500.', proxy: 'PDP (Invesco DWA Momentum) pre-2015-10', caveats: ['Retorno realizado influenciado por régimen pro-momentum 2015–2026.'] },
  SPY: { name: 'SPDR S&P 500 ETF Trust', description: 'Large blend — S&P 500 estándar.' },
  ACWI: { name: 'iShares MSCI ACWI ETF', description: 'Global — desarrollado + emergente (MSCI ACWI).' },
  CAPE: { name: 'Barclays ETN+ Shiller CAPE', description: 'Rotación sectorial value (índice Shiller CAPE).', proxy: 'RPV (Invesco S&P 500 Pure Value) pre-2022-04', caveats: ['ETN (no ETF) — deuda senior Barclays, riesgo de contraparte.'] },
};

type Props = {
  state: EstudioMedidaStateContainer;
};

export function StrategySection({ state }: Props) {
  const { config } = state;
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Estrategia detallada</Text>

      {/* Renta fija */}
      <View style={styles.sleeveCard} wrap={false}>
        <Text style={styles.sleeveTitle}>Renta fija — escalera de bonos</Text>
        <Text style={styles.sleeveMeta}>{fmtPct(config.bulletTotalPct, 0)} del AUM · Investment-grade USD</Text>
        <Text style={styles.sleeveBody}>
          Escalera de 11 bullets corporativos investment-grade USD: 9 vintages reales (BlackRock iBonds UCITS USD Corp
          Term ETFs 2026–2034) + 2 sintéticos (2035S, 2036S). Inicialización equal-weight (~9.1% por bullet del sleeve).
          Duración promedio del ladder al inicio: ~5–5.5 años. Carry inicial = YTM derivado de la curva Treasury vigente
          + spread IG de aproximadamente {(config.initialSpread * 10000).toFixed(0)} bp.{'\n\n'}
          {config.rolloverEnabled
            ? 'Rollover táctico habilitado: cada bullet, al vencer, libera principal que se reasigna según el régimen de tasas vigente (ver tabla de regímenes A/B/C abajo).'
            : 'Buy-and-hold: el principal del bullet vencido queda en cash hasta el siguiente rebalanceo reglado.'}
        </Text>
      </View>

      {/* Renta variable */}
      <View style={styles.sleeveCard} wrap={false}>
        <Text style={styles.sleeveTitle}>Renta variable — mix custom</Text>
        <Text style={styles.sleeveMeta}>
          {fmtPct(config.equityPct, 0)} del AUM · banda dura [{fmtPct(config.eqtyMin, 0)}, {fmtPct(config.eqtyMax, 0)}]
        </Text>
        {config.equityMix.map((m) => {
          const info = TICKER_INFO[m.ticker];
          const pct = equityMixTotal > 0 ? (m.weight / equityMixTotal) * 100 : 0;
          return (
            <View key={m.ticker} style={styles.tickerRow}>
              <Text style={styles.tickerSymbol}>{m.ticker}</Text>
              <Text style={styles.tickerWeight}>{Math.round(pct)}%</Text>
              <View style={styles.tickerDesc}>
                <Text>{info ? `${info.name}. ${info.description}` : 'Componente del mix de equity.'}</Text>
                {info?.proxy && (
                  <Text style={styles.caveat}>⚠ Historia spliceada con {info.proxy}.</Text>
                )}
                {info?.caveats?.map((c, i) => (
                  <Text key={i} style={styles.caveat}>⚠ {c}</Text>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {/* Cash */}
      <View style={styles.sleeveCard} wrap={false}>
        <Text style={styles.sleeveTitle}>Cash — buffer de liquidez</Text>
        <Text style={styles.sleeveMeta}>{fmtPct(config.cashPct, 0)} del AUM · BIL (T-Bills 1–3m)</Text>
        <Text style={styles.sleeveBody}>
          100% BIL (SPDR Bloomberg 1-3 Month T-Bill ETF). Riesgo crediticio soberano US (AAA+/Aaa). Duración ~0.15 años.
          Rol operativo: absorber aportes y cuotas de préstamo (si aplica), primera línea en la cascada de pago, trigger
          de rebalanceo cuando el peso de cash excede {fmtPct(config.cashBandUpper, 0)} del AUM.
        </Text>
      </View>

      {/* Rollover táctico */}
      {config.rolloverEnabled && (
        <View wrap={false}>
          <Text style={styles.sleeveTitle}>Rollover táctico — regímenes A / B / C</Text>
          <Text style={[styles.sleeveBody, { marginBottom: spacing.sm }]}>
            Cuando vence un bullet, la regla observa el estado de la curva Treasury y clasifica el momento en uno de
            tres regímenes. Cada uno tiene una acción específica para el principal liberado. La regla es escrita,
            paired bootstrap, determinista dado el seed — no es una decisión discrecional.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <View style={[styles.regimeCard, { borderLeftColor: colors.positive }]}>
              <Text style={[styles.regimeTitle, { color: colors.positive }]}>A — tasas altas + steep</Text>
              <Text style={styles.regimeBody}>
                TNX &gt; θ_high Y slope (TNX − IRX) &gt; θ_steep. Principal → bullet sintético siguiente (cargar
                duración cuando el carry compensa). Trim de equity si excede banda.
              </Text>
            </View>
            <View style={[styles.regimeCard, { borderLeftColor: colors.draft }]}>
              <Text style={[styles.regimeTitle, { color: colors.draft }]}>B — tasas bajas o flat/inv.</Text>
              <Text style={styles.regimeBody}>
                NO A, Y (TNX &lt; θ_low O slope &lt; θ_flat). Principal split (1−X)% bullet largo / X% equity sujeto
                a banda dura. RF cara, equity barato relativo.
              </Text>
            </View>
            <View style={[styles.regimeCard, { borderLeftColor: colors.navy }]}>
              <Text style={[styles.regimeTitle, { color: colors.navy }]}>C — zona neutral</Text>
              <Text style={styles.regimeBody}>
                NO A, NO B. Principal 100% al bullet sintético siguiente. Extensión natural de la escalera sin
                operaciones discrecionales — el default cuando no hay señal clara.
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
