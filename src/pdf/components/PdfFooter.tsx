import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: pageMargin.vertical / 2,
    left: pageMargin.horizontal,
    right: pageMargin.horizontal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
  },
  confidential: { flex: 1 },
  page: { marginLeft: spacing.md },
});

type Props = {
  sessionId: string;
};

export function PdfFooter({ sessionId }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap} fixed>
      <Text style={styles.confidential}>
        {t('pdf.footer.confidential')} · {sessionId}
      </Text>
      <Text
        style={styles.page}
        render={({ pageNumber, totalPages }) =>
          `${t('pdf.footer.page')} ${pageNumber} ${t('pdf.footer.of')} ${totalPages}`
        }
      />
    </View>
  );
}
