import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import { BrandLogo } from '../components/BrandBar';
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
  logoBlock: {
    marginBottom: spacing.xxl,
  },
  tagline: {
    marginTop: spacing.sm,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  hero: {
    marginTop: spacing.xl,
    paddingLeft: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
  },
  bucketTag: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.display,
    color: colors.navy,
    lineHeight: lineHeight.tight,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.bodyLarge,
    color: colors.body,
    lineHeight: lineHeight.normal,
    maxWidth: 420,
  },
  metaCard: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gold,
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
  advisorNoteCard: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.goldSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  advisorNoteLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.navyDeep,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  advisorNoteBody: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    color: colors.ink,
    lineHeight: lineHeight.normal,
    fontStyle: 'italic',
  },
  advisorNoteSign: {
    marginTop: spacing.sm,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.navy,
    textAlign: 'right',
  },
  draftBanner: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.orangeSoft,
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
  const advisorNote = state.advisor.note?.trim();

  return (
    <View style={styles.page}>
      <View style={styles.logoBlock}>
        <BrandLogo width={240} height={82} />
        <Text style={styles.tagline}>{t('pdf.brand.tagline')}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.bucketTag}>{bucketLabel}</Text>
        <Text style={styles.title}>{state.client.name}</Text>
        <Text style={styles.subtitle}>{t('pdf.cover.subtitle')}</Text>
      </View>

      {advisorNote ? (
        <View style={styles.advisorNoteCard} wrap={false}>
          <Text style={styles.advisorNoteLabel}>{t('pdf.cover.advisorNoteLabel')}</Text>
          <Text style={styles.advisorNoteBody}>{`«${advisorNote}»`}</Text>
          <Text style={styles.advisorNoteSign}>— {state.advisor.name}</Text>
        </View>
      ) : null}

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
