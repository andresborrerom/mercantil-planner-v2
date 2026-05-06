import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import type { PdfStateContainer } from '../state/types';
import { DRAFT_LOCALES } from '../../i18n';

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: pageMargin.horizontal,
    paddingTop: pageMargin.vertical,
    paddingBottom: pageMargin.vertical,
    backgroundColor: colors.pageBg,
    color: colors.body,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  brand: {
    fontFamily: fonts.serifBold,
    fontSize: fontSize.bodyLarge,
    color: colors.ink,
    letterSpacing: 0.4,
  },
  brandTagline: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  hero: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.display,
    color: colors.ink,
    lineHeight: lineHeight.tight,
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.bodyLarge,
    color: colors.muted,
    lineHeight: lineHeight.normal,
    maxWidth: 400,
  },
  metaCard: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  metaLabel: {
    width: 130,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaValue: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.ink,
  },
  draftBanner: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: '#FFF7ED',
    borderLeftWidth: 3,
    borderLeftColor: colors.draft,
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.caption,
    color: colors.draft,
  },
});

type Props = {
  state: PdfStateContainer;
};

export function CoverSection({ state }: Props) {
  const { t, i18n } = useTranslation();
  const isDraft = DRAFT_LOCALES.includes(state.locale);
  const bucketLabel = t(`pdf.cover.bucket.${state.client.bucket}`);
  const formattedDate = new Date(state.generatedAt).toLocaleDateString(
    i18n.language === 'es' ? 'es-VE' : i18n.language,
    { year: 'numeric', month: 'long', day: 'numeric' },
  );

  return (
    <View style={styles.page}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>{t('pdf.brand.name')}</Text>
        <Text style={styles.brandTagline}>{bucketLabel}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>{state.client.name}</Text>
        <Text style={styles.subtitle}>{t('pdf.cover.subtitle')}</Text>
      </View>

      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.client')}</Text>
          <Text style={styles.metaValue}>{state.client.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.advisor')}</Text>
          <Text style={styles.metaValue}>{state.advisor.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.bucket.label')}</Text>
          <Text style={styles.metaValue}>{bucketLabel}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.date')}</Text>
          <Text style={styles.metaValue}>{formattedDate}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.version')}</Text>
          <Text style={styles.metaValue}>{state.version}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.locale')}</Text>
          <Text style={styles.metaValue}>{state.locale.toUpperCase()}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{t('pdf.cover.sessionId')}</Text>
          <Text style={styles.metaValue}>{state.sessionId}</Text>
        </View>
      </View>

      {isDraft ? (
        <Text style={styles.draftBanner}>{t('pdf.draftWatermark')}</Text>
      ) : null}
    </View>
  );
}
