/**
 * Sección H — Apéndice de advertencias regulatorias y notas metodológicas.
 *
 * Agrupa los disclaimers por categoría (general, rendimientos, simulación,
 * apalancamiento, productos, limitaciones) y los renderiza con tipografía
 * compacta. Los textos vienen de disclaimers.ts (constantes propuestas
 * con base en investigación regulatoria — sujetas a revisión de Compliance).
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { EstudioBrandBar } from '../components/EstudioBrandBar';
import {
  DISCLAIMERS,
  DISCLAIMER_CATEGORY_LABELS,
  PROXY_DISCLAIMER,
  type DisclaimerCategory,
} from '../disclaimers';
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
  catWrap: {
    marginBottom: spacing.lg,
  },
  catTitle: {
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
  itemWrap: {
    marginBottom: spacing.sm,
  },
  itemTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.ink,
    marginBottom: 2,
  },
  itemBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro + 0.5,
    color: colors.body,
    lineHeight: lineHeight.normal,
    textAlign: 'justify',
  },
  proxyBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceTint,
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
  },
  proxyTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  proxyBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro + 0.5,
    color: colors.body,
    lineHeight: lineHeight.normal,
    textAlign: 'justify',
  },
  footer: {
    marginTop: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textAlign: 'center',
  },
});

const CATEGORY_ORDER: DisclaimerCategory[] = [
  'general',
  'rendimientos',
  'simulacion',
  'apalancamiento',
  'productos',
  'limitaciones',
];

type Props = {
  state: EstudioMedidaStateContainer;
};

export function DisclaimersSection({ state }: Props) {
  const equityTickers = state.config.equityMix.map((m) => m.ticker);
  const hasProxiedTickers = equityTickers.some((t) => t === 'SPMO' || t === 'CAPE');
  const hasLeverage = state.config.loanEnabled;
  const hasEtn = equityTickers.includes('CAPE');

  // Filtrado contextual: ocultar el disclaimer del apalancamiento si el config
  // no lo activa, y el de ETN si CAPE no está en el mix. Esto evita texto
  // legalmente innecesario y mantiene el apéndice enfocado en el estudio actual.
  const relevant = DISCLAIMERS.filter((d) => {
    if (!hasLeverage && d.category === 'apalancamiento') return false;
    if (!hasEtn && d.id === 'F') return false; // disclaimer F = ETN específico
    return true;
  });

  const byCategory: Record<DisclaimerCategory, typeof DISCLAIMERS> = {
    general: [],
    rendimientos: [],
    simulacion: [],
    apalancamiento: [],
    productos: [],
    limitaciones: [],
  };
  for (const d of relevant) {
    byCategory[d.category] = [...byCategory[d.category], d];
  }

  const formattedDate = new Date(state.generatedAt).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.page}>
      <EstudioBrandBar state={state} />
      <Text style={styles.h2}>Apéndice — Advertencias regulatorias y notas metodológicas</Text>
      <Text style={styles.intro}>
        Lista consolidada de advertencias aplicables al presente estudio. El contenido refleja la práctica
        estándar de la industria y la normativa relevante (SMV Panamá, SEC Marketing Rule, FINRA, CFA Institute).
        Se incluyen tanto disclaimers de cumplimiento obligatorio como recomendaciones de mejor práctica para
        documentos de wealth management con simulaciones Monte Carlo. Cualquier modificación material a esta
        sección debe pasar por revisión de Compliance y legal del cliente.
      </Text>

      {CATEGORY_ORDER.map((cat) => {
        const items = byCategory[cat];
        if (items.length === 0) return null;
        return (
          <View key={cat} style={styles.catWrap}>
            <Text style={styles.catTitle}>{DISCLAIMER_CATEGORY_LABELS[cat]}</Text>
            {items.map((d) => (
              <View key={d.id} style={styles.itemWrap} wrap={false}>
                <Text style={styles.itemTitle}>{d.id}. {d.title}</Text>
                <Text style={styles.itemBody}>{d.body}</Text>
              </View>
            ))}
          </View>
        );
      })}

      {hasProxiedTickers && (
        <View style={styles.proxyBox} wrap={false}>
          <Text style={styles.proxyTitle}>Nota metodológica — series históricas spliceadas</Text>
          <Text style={styles.proxyBody}>{PROXY_DISCLAIMER}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        Documento generado el {formattedDate} · ID de sesión: {state.sessionId} · Versión {state.schemaVersion}
      </Text>
    </View>
  );
}
