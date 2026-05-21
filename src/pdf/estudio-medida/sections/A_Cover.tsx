/**
 * Sección A — Portada del PDF "Estudio a la Medida".
 *
 * Estructura inspirada en src/pdf/sections/A_Cover.tsx (Comparador A/B) pero
 * adaptada al contenido del Caso de Estudio: hero con tipo de cliente,
 * subtipo si aplica, governance/edad opcional, fecha del estudio + mini
 * disclaimer.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize, lineHeight } from '../../theme/typography';
import { pageMargin, spacing } from '../../theme/spacing';
import { BrandLogo } from '../../components/BrandBar';
import { COVER_MINI_DISCLAIMER } from '../disclaimers';
import type { EstudioMedidaStateContainer } from '../state/types';

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
  prefix: {
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
    maxWidth: 460,
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
    width: 150,
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
  miniDisclaimer: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    lineHeight: lineHeight.normal,
  },
});

const SUBTYPE_LABELS: Record<string, string> = {
  endowment: 'Endowment / Fondo perpetuo',
  fundacion: 'Fundación',
  colegio: 'Institución educativa',
  empresa: 'Empresa',
  familia: 'Family Office',
  otro: 'Otra estructura',
};

type Props = {
  state: EstudioMedidaStateContainer;
};

export function CoverSection({ state }: Props) {
  const isJur = state.client.type === 'juridica';
  const typeLabel = isJur ? 'Persona Jurídica' : 'Persona Natural';
  const subtypeLabel = state.client.subtype ? SUBTYPE_LABELS[state.client.subtype] : null;
  const formattedDate = new Date(state.generatedAt).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const advisorNote = state.advisor.note?.trim();
  const subtitle = isJur
    ? 'Propuesta de inversión institucional y políticas operativas asociadas, generada a la medida del mandato y horizonte del cliente.'
    : 'Propuesta de inversión y directrices personales generadas a la medida de los objetivos, horizonte y tolerancia al riesgo del cliente.';

  return (
    <View style={styles.page}>
      <View style={styles.logoBlock}>
        <BrandLogo width={240} height={82} />
        <Text style={styles.tagline}>Mercantil · Estudio a la Medida</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.prefix}>{typeLabel}{subtypeLabel ? ` · ${subtypeLabel}` : ''}</Text>
        <Text style={styles.title}>{state.client.name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {advisorNote ? (
        <View style={styles.advisorNoteCard} wrap={false}>
          <Text style={styles.advisorNoteLabel}>Mensaje del asesor</Text>
          <Text style={styles.advisorNoteBody}>{`«${advisorNote}»`}</Text>
          <Text style={styles.advisorNoteSign}>— {state.advisor.name}</Text>
        </View>
      ) : null}

      <View style={styles.metaCard}>
        <MetaRow label="Cliente" value={state.client.name} />
        <MetaRow label="Tipo" value={typeLabel + (subtypeLabel ? ` · ${subtypeLabel}` : '')} />
        {state.client.age !== undefined && (
          <MetaRow label="Edad" value={`${state.client.age} años`} />
        )}
        {state.client.governance && (
          <MetaRow label="Órgano decisor" value={state.client.governance} />
        )}
        <MetaRow label="Asesor" value={state.advisor.name} />
        <MetaRow label="Fecha del estudio" value={formattedDate} />
        <MetaRow label="Versión" value={state.version === 'completa' ? 'Completa' : 'Ejecutiva'} />
        <MetaRow label="Idioma" value={state.locale.toUpperCase()} />
        <MetaRow label="ID de sesión" value={state.sessionId} />
      </View>

      <Text style={styles.miniDisclaimer}>{COVER_MINI_DISCLAIMER}</Text>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}
