/**
 * Sección D — Política de Inversión / Directrices Personales.
 *
 * El corazón del entregable. Cambia materialmente según `client.type`:
 *   - juridica → IPS formal con 15 secciones canónicas (estructura del
 *     benchmark TBSC: BENCHMARK_ENDOWMENT_POLICIES.md de estudios-a-la-medida).
 *   - natural → Directrices Personales con 8 secciones basadas en
 *     CFA Standard III(D) + anclaje psicológico ("la volatilidad no es
 *     riesgo, es el costo de cumplir el objetivo" — del instructivo
 *     parte-5-casos-cliente).
 *
 * Los parámetros operacionales (allocation, bandas, spread, thresholds) se
 * citan literal del config. Las decisiones de governance/aprobación las
 * propone como template editable, no como hecho — el legal del cliente o
 * el comité ajusta antes de firmar.
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
    marginBottom: spacing.md,
  },
  intro: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.caption,
    color: colors.muted,
    lineHeight: lineHeight.normal,
    marginBottom: spacing.lg,
  },
  sectionWrap: {
    marginBottom: spacing.md,
  },
  num: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.orange,
  },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    lineHeight: lineHeight.normal,
    paddingLeft: spacing.md,
  },
  anchor: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.goldSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  anchorTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navyDeep,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  anchorBody: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    color: colors.ink,
    lineHeight: lineHeight.normal,
    fontStyle: 'italic',
  },
});

type Props = {
  state: EstudioMedidaStateContainer;
};

export function PolicyStatementSection({ state }: Props) {
  return state.client.type === 'juridica' ? (
    <JuridicaIPS state={state} />
  ) : (
    <NaturalDirectives state={state} />
  );
}

// =====================================================================
// JURÍDICA — Investment Policy Statement (IPS) formal
// 15 secciones del benchmark BENCHMARK_ENDOWMENT_POLICIES.md
// =====================================================================

function JuridicaIPS({ state }: Props) {
  const { client, config } = state;
  const governance = client.governance || 'Órgano competente';
  const horizonStr = fmtMonths(config.horizonMonths);
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  const equityMixStr = config.equityMix
    .map((m) => `${Math.round((m.weight / equityMixTotal) * 100)}% ${m.ticker}`)
    .join(' · ');

  const sections = [
    {
      n: '1',
      t: 'Propósito (Statement of Purpose)',
      b: `Este documento formaliza la política de inversión de ${client.name}. Su objetivo es preservar y hacer crecer el patrimonio bajo gestión, asegurando consistencia operativa, transparencia frente a los stakeholders relevantes y alineación con el mandato institucional. La política aquí descrita se aplica al patrimonio gestionado a través de Mercantil bajo este estudio; otros activos del cliente no están comprendidos por este IPS salvo disposición en contrario.`,
    },
    {
      n: '2',
      t: 'Horizonte temporal y objetivo de retorno',
      b: `Horizonte de planeación: ${horizonStr}. La política se diseña para un escenario perpetuo o multi-generacional según el caso, con revisión sustantiva al menos cada ${horizonYears(config.horizonMonths) >= 10 ? '5' : '3'} años. El objetivo de retorno es preservar el poder adquisitivo del capital tras inflación esperada y, una vez cubierta esa base, generar excedente real moderado consistente con la asignación estratégica establecida en la sección 4.`,
    },
    {
      n: '3',
      t: 'Tolerancia al riesgo',
      b: `El portafolio se construye con sesgo defensivo, priorizando preservación de capital y limitando drawdowns visibles en reportes periódicos. La banda dura de renta variable establece un piso de ${fmtPct(config.eqtyMin, 0)} y un techo de ${fmtPct(config.eqtyMax, 0)} del AUM total, definidos para acotar la exposición a mercados accionarios incluso bajo condiciones tácticas favorables o adversas.`,
    },
    {
      n: '4',
      t: 'Asignación estratégica (Strategic Asset Allocation)',
      b: `Ancla estratégica: ${fmtPct(config.bulletTotalPct, 0)} renta fija (escalera de bonos corporativos investment-grade, ladder iBonds), ${fmtPct(config.equityPct, 0)} renta variable (${equityMixStr}), ${fmtPct(config.cashPct, 0)} cash (BIL, T-Bills 1–3 meses). Esta es la composición target a la cual el portafolio retorna por defecto luego de eventos tácticos o de liquidez.`,
    },
    {
      n: '5',
      t: 'Bandas tácticas y caps duros',
      b: `Renta variable se mueve dentro de la banda dura [${fmtPct(config.eqtyMin, 0)}, ${fmtPct(config.eqtyMax, 0)}] del AUM. El rebalanceo táctico opera contra esta banda con la lógica A/B/C descrita en la sección 12. El cash sleeve tiene una banda superior de ${fmtPct(config.cashBandUpper, 0)}: cuando el peso del cash excede ese umbral, el exceso se redistribuye proporcionalmente a los demás sleeves.`,
    },
    {
      n: '6',
      t: 'Calidad crediticia',
      b: (() => {
        const hy = config.bulletMix.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
        const ig = config.bulletMix.find((m) => m.ticker === 'iBonds')?.weight ?? 0;
        const tot = hy + ig;
        const wHY = tot > 0 ? hy / tot : 0;
        if (wHY < 1e-9) {
          return 'Renta fija exclusivamente investment-grade (rating BBB-/Baa3 o superior al momento de la compra). No se admite high-yield ni emerging-market corporate. Promedio del lineup iBonds: rating cercano a A-/A3 ponderado por exposición.';
        }
        const wHYPct = Math.round(wHY * 100);
        const wIGPct = 100 - wHYPct;
        return (
          `La política permite high-yield corporativo USD con cap del ${wHYPct}% del sleeve de renta fija. ` +
          `Lineup IG (${wIGPct}% del sleeve, ~${(((1 - wHY) * config.bulletTotalPct) * 100).toFixed(0)}% del AUM): ` +
          `iBonds UCITS USD Corp BBB-/Baa3+ (promedio del índice ~A-/A3). ` +
          `Componente HY (${wHYPct}% del sleeve, ~${((wHY * config.bulletTotalPct) * 100).toFixed(0)}% del AUM): ` +
          `GHYG (iShares Global HY Corp UCITS, ratings BB/B/CCC diversificados). ` +
          `No se admite emerging-market corporate ni convertibles.`
        );
      })(),
    },
    {
      n: '7',
      t: 'Moneda funcional',
      b: 'USD como moneda base de todos los instrumentos del portafolio. La política no contempla exposición intencional a otras monedas; cualquier exposición cambiaria operativa (clientes cuya moneda funcional difiere del USD) se gestiona fuera de este IPS.',
    },
    {
      n: '8',
      t: 'Tiers de liquidez',
      b: 'Cash sleeve (BIL): liquidez diaria, sin pérdida material en condiciones normales. Equity sleeve (ETFs líquidos): liquidez intradía. Renta fija (iBonds UCITS): liquidez intradía con bid-ask spreads típicos 5–15 bp en condiciones normales, hasta 50 bp en estrés. Los bullets tienen además liquidez natural al vencimiento.',
    },
    {
      n: '9',
      t: 'Política de aportes y distribuciones',
      b: `Aporte anual base: ${fmtMoney(config.inflowBaseAnnual)} con crecimiento ${fmtPct(config.inflowGrowth)}. Los aportes ingresan al cash sleeve y, cuando éste excede ${fmtPct(config.cashBandUpper, 0)}, se redistribuyen a los sleeves de renta fija y variable proporcionalmente al ancla estratégica. Distribuciones extraordinarias se evalúan caso a caso por ${governance} antes de ejecutarse.`,
    },
    {
      n: '10',
      t: 'Regla de rebalanceo',
      b: 'El portafolio se rebalancea de forma reglada en dos casos: (a) cuando cash supera su banda superior, redistribuyendo el exceso a los demás sleeves; (b) cuando los bullets vencen, redistribuyendo el principal liberado según la regla A/B/C de la sección 12. No se rebalancea de forma discrecional fuera de esos casos para evitar costos operativos y errores de timing.',
    },
    {
      n: '11',
      t: 'Apalancamiento bancario',
      b: config.loanEnabled
        ? `La política contempla un apalancamiento operativo en el mes ${config.loanTriggerMonth}, por hasta ${fmtPct(config.loanAmountPctAum, 0)} del AUM al disparo, plazo ${config.loanTermMonths} meses. Las cuotas se pagan con flujos naturales del portafolio en cascada cash → equity → bullet corto. El uso de apalancamiento queda explícitamente autorizado dentro del marco de este IPS.`
        : 'La política actual NO contempla apalancamiento bancario. Cualquier endeudamiento futuro requiere modificación formal del IPS.',
    },
    {
      n: '12',
      t: 'Rollover táctico al vencer un bullet',
      b: config.rolloverEnabled
        ? 'Al vencer un bullet, su principal se reasigna según el régimen de tasas vigente: Régimen A (tasas altas + slope steep) → todo al bullet sintético siguiente, trim de equity si excede banda. Régimen B (tasas bajas o curva flat/invertida) → split (1−X)% bullet largo / X% equity dentro de banda. Régimen C (zona neutra) → 100% al bullet sintético siguiente. Los thresholds están parametrizados y fijos para esta política.'
        : 'Buy-and-hold sobre la escalera. Al vencer un bullet, el principal queda en cash hasta el siguiente proceso de rebalanceo reglado.',
    },
    {
      n: '13',
      t: 'Governance y aprobaciones',
      b: `Mercantil opera la política como gestor; ${governance} retiene la autoridad de aprobar modificaciones a esta política, cambios en el monto del aporte anual, autorización de apalancamiento extraordinario y cualquier distribución que exceda el patrón operativo descrito. Mercantil reporta trimestralmente con métricas estandarizadas y anualmente con revisión integral de cumplimiento.`,
    },
    {
      n: '14',
      t: 'Revisión y monitoreo',
      b: 'Revisión anual ligera (compliance, métricas, ajustes operativos) y revisión sustantiva cada 3–5 años (calibración del IPS frente al horizonte residual, contexto de mercado y necesidades evolucionadas del cliente). Eventos extraordinarios (cambios materiales del cliente, dislocaciones de mercado relevantes) pueden disparar revisión fuera de calendario.',
    },
    {
      n: '15',
      t: 'Proceso de modificación',
      b: `Modificaciones a este IPS requieren propuesta formal de Mercantil o de ${governance}, análisis de impacto, y aprobación documentada. Las modificaciones entran en vigor a partir de la fecha de aprobación; el versionado del documento se mantiene para trazabilidad histórica.`,
    },
  ];

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Investment Policy Statement (IPS)</Text>
      <Text style={styles.intro}>
        Documento de política de inversión formal. Estructura basada en la práctica institucional estándar
        (CFA Institute / NACUBO benchmark institucional). Las cifras operativas son las del estudio
        adjunto; el lenguaje normativo es una propuesta sólida sujeta a revisión por Compliance y legal del cliente.
      </Text>
      {sections.map((s) => (
        <View key={s.n} style={styles.sectionWrap} wrap={false}>
          <Text style={styles.sectionTitle}>
            <Text style={styles.num}>{s.n}. </Text>
            {s.t}
          </Text>
          <Text style={styles.body}>{s.b}</Text>
        </View>
      ))}
    </View>
  );
}

// =====================================================================
// NATURAL — Directrices Personales de Inversión
// 8 secciones basadas en CFA Standard III(D) para individuos
// =====================================================================

function NaturalDirectives({ state }: Props) {
  const { client, config } = state;
  const horizonStr = fmtMonths(config.horizonMonths);
  const horizonY = horizonYears(config.horizonMonths);
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  const equityMixStr = config.equityMix
    .map((m) => `${Math.round((m.weight / equityMixTotal) * 100)}% ${m.ticker}`)
    .join(' · ');

  const fase = inferLifeCyclePhase(config);

  const sections = [
    {
      n: '1',
      t: 'Objetivo del plan',
      b: `Este documento formaliza las directrices personales de inversión de ${client.name}. El objetivo del plan es ${fase.objectiveDescription} sobre un horizonte de ${horizonStr}. El presente documento aplica al patrimonio gestionado a través de Mercantil bajo este estudio; otros activos del cliente quedan fuera del alcance de estas directrices.`,
    },
    {
      n: '2',
      t: 'Horizonte y edad de confianza',
      b: client.age !== undefined
        ? `Horizonte de planeación: ${horizonStr} (al cierre del plan el cliente tendría ${client.age + horizonY} años). La edad de confianza —entendida como el horizonte hasta el cual la simulación da respaldo razonable al patrón de aportes/retiros planeado— está implícita en los percentiles de la simulación: si la banda inferior (P5) cae por debajo del capital aportado neto antes del cierre del plan, la edad de confianza efectiva es menor que el horizonte nominal.`
        : `Horizonte de planeación: ${horizonStr}. La edad de confianza —entendida como el horizonte hasta el cual la simulación da respaldo razonable al patrón de aportes/retiros planeado— está implícita en los percentiles de la simulación. La actualización del documento debe incluir esta evaluación en cada revisión periódica.`,
    },
    {
      n: '3',
      t: 'Tolerancia al riesgo personal',
      b: `Las decisiones del plan asumen que el cliente está emocional y financieramente preparado para sostener una caída temporal del capital del orden de la banda P5 simulada sin alterar la estrategia (sin vender en pánico). La banda dura de renta variable establece un piso de ${fmtPct(config.eqtyMin, 0)} y un techo de ${fmtPct(config.eqtyMax, 0)} del patrimonio, acotando la exposición incluso en condiciones extremas.`,
    },
    {
      n: '4',
      t: 'Asignación estratégica',
      b: `${fmtPct(config.bulletTotalPct, 0)} renta fija (escalera de bonos corporativos investment-grade con vencimientos escalonados), ${fmtPct(config.equityPct, 0)} renta variable (${equityMixStr}) y ${fmtPct(config.cashPct, 0)} cash (T-Bills cortos). Esta es la composición target a la cual el portafolio retorna por defecto tras eventos tácticos o de liquidez.`,
    },
    {
      n: '5',
      t: 'Política de aportes y retiros',
      b: `Aporte anual base: ${fmtMoney(config.inflowBaseAnnual)} con crecimiento ${fmtPct(config.inflowGrowth)}. ${fase.flowsDescription} Los aportes ingresan al cash sleeve y, cuando éste excede ${fmtPct(config.cashBandUpper, 0)}, se redistribuyen a los demás sleeves. Cualquier retiro extraordinario debe ser comunicado al asesor con anticipación razonable para evaluar el impacto sobre la sostenibilidad del plan.`,
    },
    {
      n: '6',
      t: 'Regla de rebalanceo',
      b: config.rolloverEnabled
        ? 'El portafolio aplica rollover táctico al vencer cada bullet (regla escrita A/B/C, paired bootstrap, no discrecional). Adicionalmente, cuando el cash sleeve excede su banda superior, el exceso se redistribuye a renta fija y variable proporcionalmente al ancla estratégica.'
        : 'Buy-and-hold sobre la escalera de bonos. Al vencer un bullet, el principal queda en cash hasta el siguiente proceso de rebalanceo. Cash redistribuye al exceder banda superior.',
    },
    {
      n: '7',
      t: 'Cadencia de revisión',
      b: 'Revisión anual completa, monitoreo trimestral de ejecución, y revisión fuera de calendario ante eventos materiales (cambios familiares relevantes, dislocaciones de mercado, modificaciones del patrón de aportes o retiros). En cada revisión se actualizan las cifras de la simulación, se reevalúa la edad de confianza y se ajustan parámetros si el contexto lo requiere.',
    },
    {
      n: '8',
      t: 'Anclaje psicológico (importante)',
      b: 'El cliente reconoce y acepta que la volatilidad del portafolio —caídas temporales visibles en los reportes periódicos— no es por sí misma el riesgo del plan. El riesgo real del plan es no cumplir el objetivo establecido en la sección 1. La volatilidad es el costo de cumplir ese objetivo. Esta distinción es la base para no alterar la estrategia ante movimientos de corto plazo del mercado.',
    },
  ];

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Directrices Personales de Inversión</Text>
      <Text style={styles.intro}>
        Documento de directrices personales — versión individual del Investment Policy Statement institucional.
        Estructura basada en CFA Institute Standard III(D) para inversionistas individuales, con ajustes
        para el contexto de banca privada y wealth management offshore.
      </Text>
      {sections.map((s) => (
        <View key={s.n} style={styles.sectionWrap} wrap={false}>
          <Text style={styles.sectionTitle}>
            <Text style={styles.num}>{s.n}. </Text>
            {s.t}
          </Text>
          <Text style={styles.body}>{s.b}</Text>
        </View>
      ))}
      <View style={styles.anchor}>
        <Text style={styles.anchorTitle}>Mantra rector</Text>
        <Text style={styles.anchorBody}>
          «La volatilidad no es riesgo. Es el costo de cumplir el objetivo. El riesgo es no cumplir el objetivo.»
        </Text>
      </View>
    </View>
  );
}

// =====================================================================
// Helpers
// =====================================================================

function horizonYears(months: number): number {
  return Math.round(months / 12);
}

type LifePhase = {
  objectiveDescription: string;
  flowsDescription: string;
};

function inferLifeCyclePhase(config: {
  inflowBaseAnnual: number;
  horizonMonths: number;
}): LifePhase {
  // Heurística simple para personalizar el lenguaje según patrón de flujos.
  const positive = config.inflowBaseAnnual > 0;
  const negative = config.inflowBaseAnnual < 0;
  const longHorizon = config.horizonMonths >= 180;
  if (positive && longHorizon) {
    return {
      objectiveDescription:
        'acumular capital con aportes recurrentes hacia una meta de mediano-largo plazo (acumulación)',
      flowsDescription:
        'El patrón previsto es de acumulación: aportes regulares sin retiros sustanciales durante el horizonte del plan.',
    };
  }
  if (positive) {
    return {
      objectiveDescription: 'preservar y hacer crecer capital con aportes graduales',
      flowsDescription:
        'El patrón previsto contempla aportes recurrentes alineados con el horizonte del plan.',
    };
  }
  if (negative) {
    return {
      objectiveDescription:
        'sostener un patrón de retiros recurrentes preservando el capital el mayor tiempo posible (decumulación)',
      flowsDescription:
        'El patrón previsto es de decumulación: retiros regulares para cubrir necesidades del cliente, con el portafolio sirviendo de fuente sostenible.',
    };
  }
  return {
    objectiveDescription:
      'preservar el capital existente y generar excedente moderado, sin aportes ni retiros relevantes (buy-and-hold preservacionista)',
    flowsDescription:
      'El patrón previsto no contempla aportes ni retiros relevantes durante el horizonte del plan.',
  };
}
