/**
 * Factory del PDF "Estudio a la Medida". Análogo a src/pdf/MercantilPdf.tsx
 * (que es del Comparador A/B). Cada Page contiene una sección + footer.
 *
 * IMPORTANTE: el caller debe asegurar `await i18n.changeLanguage(state.locale)`
 * ANTES de invocar pdf(<element>) — los hooks `useTranslation` (usados en el
 * PdfFooter) consumen el singleton de i18n.
 */
import { Document, Page, StyleSheet } from '@react-pdf/renderer';

import { PdfFooter } from '../components/PdfFooter';
import { colors } from '../theme/colors';
import { CoverSection } from './sections/A_Cover';
import { ExecutiveSummarySection } from './sections/B_ExecutiveSummary';
import { SnapshotSection } from './sections/C_Snapshot';
import { PolicyStatementSection } from './sections/D_PolicyStatement';
import { StrategySection } from './sections/E_Strategy';
import { ResultsSection } from './sections/F_Results';
import { DisclaimersSection } from './sections/H_Disclaimers';
import type { EstudioMedidaStateContainer } from './state/types';

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.pageBg,
  },
});

export function createEstudioMedidaPdfDocument(state: EstudioMedidaStateContainer) {
  const docTitle = `Estudio a la Medida — ${state.client.name}`;
  const subject = `Mercantil — Estudio a la Medida · ${state.client.type} · ${state.client.bucket}`;
  const isEjec = state.version === 'ejecutiva';

  return (
    <Document
      title={docTitle}
      author="Mercantil Servicios Financieros Internacional"
      creator="Mercantil Planner — Estudio a la Medida"
      producer="Mercantil Planner — Estudio a la Medida"
      subject={subject}
      keywords={`estudio-medida,mercantil,planner,${state.locale},${state.client.type}`}
    >
      {/* Portada — siempre presente */}
      <Page size="A4" style={styles.page}>
        <CoverSection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Resumen ejecutivo — siempre */}
      <Page size="A4" style={styles.page}>
        <ExecutiveSummarySection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Snapshot — siempre */}
      <Page size="A4" style={styles.page}>
        <SnapshotSection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Política / Directrices — siempre (núcleo del estudio) */}
      <Page size="A4" style={styles.page}>
        <PolicyStatementSection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Estrategia — siempre */}
      <Page size="A4" style={styles.page}>
        <StrategySection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Resultados — siempre (si hay result) */}
      <Page size="A4" style={styles.page}>
        <ResultsSection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>

      {/* Apéndice de disclaimers — siempre presente.
          La versión Ejecutiva los muestra igual, sólo con texto un poco más
          compacto; sacarlos sería un problema regulatorio. */}
      {!isEjec && (
        <Page size="A4" style={styles.page}>
          <DisclaimersSection state={state} />
          <PdfFooter sessionId={state.sessionId} />
        </Page>
      )}
      {isEjec && (
        <Page size="A4" style={styles.page}>
          <DisclaimersSection state={state} />
          <PdfFooter sessionId={state.sessionId} />
        </Page>
      )}
    </Document>
  );
}
