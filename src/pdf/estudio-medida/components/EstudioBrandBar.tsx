/**
 * Header de página del PDF "Estudio a la Medida". Variante del BrandBar del
 * Comparador A/B que toma el state container del estudio (con `clientType`)
 * y muestra un badge "Estudio a la Medida · Persona Natural/Jurídica" en
 * lugar del badge de bucket Wealth Way.
 */
import { Image, Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import type { EstudioMedidaStateContainer } from '../state/types';

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
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.orangeSoft,
    borderRadius: 2,
  },
  badgeText: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.orangeDeep,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

type Props = {
  state: EstudioMedidaStateContainer;
};

export function EstudioBrandBar({ state }: Props) {
  const typeLabel = state.client.type === 'juridica' ? 'Persona Jurídica' : 'Persona Natural';
  return (
    <View style={styles.bar}>
      <Image src={LOGO_URL} style={styles.logo} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Estudio a la Medida · {typeLabel}</Text>
      </View>
    </View>
  );
}
