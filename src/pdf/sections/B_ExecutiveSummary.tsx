import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import { BrandBar } from '../components/BrandBar';
import type { PdfStateContainer } from '../state/types';

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: pageMargin.horizontal,
    paddingBottom: pageMargin.vertical,
    backgroundColor: colors.pageBg,
    color: colors.body,
  },
  pageWrapper: {
    flex: 1,
  },
  header: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    color: colors.navy,
    marginBottom: spacing.xl,
    lineHeight: lineHeight.tight,
  },
  block: {
    marginBottom: spacing.lg,
  },
  blockLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  blockBody: {
    fontFamily: fonts.serif,
    fontSize: fontSize.bodyLarge,
    color: colors.ink,
    lineHeight: lineHeight.normal,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h1,
    color: colors.orange,
    lineHeight: lineHeight.tight,
  },
  metricLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  metricExplainer: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: spacing.xs,
    maxWidth: 200,
  },
  placeholder: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.caption,
    color: colors.muted,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
  },
});

type Props = {
  state: PdfStateContainer;
  // Datos placeholder — en sesiones futuras vendrán del store/simulación.
  placeholders?: {
    objective?: string;
    confidenceAge?: number;
    nextActions?: string[];
    nextReviewDate?: string;
  };
};

export function ExecutiveSummarySection({ state, placeholders }: Props) {
  const { t, i18n } = useTranslation();
  const objective = placeholders?.objective ?? '—';
  const confidenceAge = placeholders?.confidenceAge ?? 0;
  const nextReview = placeholders?.nextReviewDate
    ? new Date(placeholders.nextReviewDate).toLocaleDateString(
        i18n.language === 'es' ? 'es-VE' : i18n.language,
        { year: 'numeric', month: 'long', day: 'numeric' },
      )
    : '—';

  return (
    <View style={styles.pageWrapper}>
      <BrandBar state={state} />
      <View style={styles.page}>
      <Text style={styles.header}>{state.client.name}</Text>
      <Text style={styles.title}>{t('pdf.exec.title')}</Text>

      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('pdf.exec.objective')}</Text>
        <Text style={styles.blockBody}>{objective}</Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{confidenceAge || '—'}</Text>
          <Text style={styles.metricLabel}>{t('pdf.exec.confidenceAge.label')}</Text>
          <Text style={styles.metricExplainer}>
            {t('pdf.exec.confidenceAge.explainer')}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{nextReview}</Text>
          <Text style={styles.metricLabel}>{t('pdf.exec.nextReview')}</Text>
        </View>
      </View>

      <Text style={styles.placeholder}>
        [Skeleton: secciones B2 (asignación), B4 (próximos pasos detallados),
        proyección 30a, regímenes históricos pendientes — se completan en sesiones siguientes
        contra datos reales del store.]
      </Text>
      </View>
    </View>
  );
}
