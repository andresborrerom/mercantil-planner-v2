import { Image, Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import type { PdfStateContainer } from '../state/types';

const LOGO_URL = `${import.meta.env.BASE_URL}mercantil-logo.png`;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: pageMargin.horizontal,
    paddingTop: pageMargin.vertical / 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gold,
  },
  logo: {
    width: 110,
    height: 38,
    objectFit: 'contain',
  },
  logoFallback: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.bodyLarge,
    color: colors.navy,
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.navySoft,
    borderRadius: 2,
  },
  badgeText: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

type Props = {
  state: PdfStateContainer;
};

/**
 * Header de página común a las secciones B/C/D/E. Muestra el logo Mercantil
 * (servido desde `public/mercantil-logo.png`) y un badge con el bucket Wealth
 * Way activo (Liquidez / Longevidad / Legado).
 *
 * El logo se referencia por URL absoluta (`/mercantil-logo.png` resuelta vía
 * `BASE_URL`) para que el archivo viva en `public/` y se sirva sin pasar por
 * el bundler. Si todavía no se subió, `<Image>` falla silenciosamente y queda
 * el fallback de texto.
 */
export function BrandBar({ state }: Props) {
  const { t } = useTranslation();
  const bucketLabel = t(`pdf.cover.bucket.${state.client.bucket}`);

  return (
    <View style={styles.bar}>
      <Image src={LOGO_URL} style={styles.logo} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{bucketLabel}</Text>
      </View>
    </View>
  );
}

/**
 * Versión grande del logo para la portada (sección A). Sin badge, sin
 * borde — la portada arma su propio layout alrededor.
 */
export function BrandLogo({ width = 220, height = 76 }: { width?: number; height?: number }) {
  return <Image src={LOGO_URL} style={{ width, height, objectFit: 'contain' }} />;
}
