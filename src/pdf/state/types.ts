import type { BootstrapConfig, PlanSpec, PortfolioSpec } from '../../domain/types';

export type WealthBucket = 'liquidity' | 'longevity' | 'legacy';
export type PdfLocale = 'es' | 'en' | 'fr' | 'de';
export type PdfVersion = 'completa' | 'ejecutiva';

export type PdfStateContainer = {
  schemaVersion: 1;
  generatedAt: string;
  sessionId: string;
  client: {
    name: string;
    bucket: WealthBucket;
  };
  advisor: {
    name: string;
    /**
     * Mensaje personalizado del asesor para el cliente. Se renderiza en la
     * portada (sección A) si está presente. Opcional — input libre del modal.
     */
    note?: string;
  };
  locale: PdfLocale;
  version: PdfVersion;
  modules: {
    stressTests: boolean;
    sensitivities: boolean;
    methodology: boolean;
  };
  planner: {
    portfolioA: PortfolioSpec;
    portfolioB: PortfolioSpec;
    plan: PlanSpec;
    bootstrap: BootstrapConfig;
    window: { startMonth: number; endMonth: number };
  };
};

export const PDF_STATE_SCHEMA_VERSION = 1 as const;
export const PDF_STATE_XMP_NAMESPACE = 'http://mawm-lab.com/xmp/1.0/' as const;
export const PDF_STATE_XMP_PREFIX = 'mawm' as const;
