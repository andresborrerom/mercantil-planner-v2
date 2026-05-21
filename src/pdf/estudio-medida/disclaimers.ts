/**
 * Textos legales y disclaimers del PDF "Estudio a la Medida".
 *
 * Redactados con base en investigación regulatoria (SMV Panamá, SEC Marketing
 * Rule 206(4)-1, FINRA 2210/2264, CFA Standard III(D), boilerplate JP Morgan PB
 * y Vanguard PAS). Pensados para tener alta probabilidad de pasar revisión
 * legal sin reescritura grande — el legal interno puede ajustar redacción
 * fina pero la estructura y el contenido cubren las exigencias estándar.
 *
 * Estos textos NO son consejo legal; son una propuesta sólida para revisión.
 * Cualquier despliegue a producción debería pasar por validación de Compliance.
 *
 * Referencias normativas claves:
 *   - SMV Panamá: Texto Único DL 1/1999, Acuerdo 8-2014, Código de Conducta MV
 *   - SEC: 17 CFR 275.206(4)-1 (Marketing Rule)
 *   - FINRA: Rule 2210 (Communications), Rule 2264 (Margin Disclosure)
 *   - CFA Institute: Standard III(D) Performance Presentation
 *   - UCITS / Regulation S: restricciones a US Persons en ETFs UCITS
 */

export type DisclaimerCategory =
  | 'general'
  | 'rendimientos'
  | 'simulacion'
  | 'apalancamiento'
  | 'productos'
  | 'limitaciones';

export type Disclaimer = {
  id: string;
  category: DisclaimerCategory;
  title: string;
  body: string;
  /** Tier: 'mandatory' = imprescindible, 'recommended' = mejora defensibilidad. */
  tier: 'mandatory' | 'recommended';
  /** Fuente normativa principal — informativa para legal. */
  source: string;
};

export const DISCLAIMERS: ReadonlyArray<Disclaimer> = [
  // ---- IMPRESCINDIBLES ----
  {
    id: 'A',
    category: 'general',
    tier: 'mandatory',
    title: 'Naturaleza informativa, no recomendación personalizada',
    body:
      'El presente documento ha sido preparado por Mercantil con fines exclusivamente informativos e ilustrativos. No constituye una oferta, solicitud, recomendación personalizada ni asesoría legal, contable, tributaria o de inversión, ni debe interpretarse como tal. El cliente es responsable de evaluar la idoneidad de las inversiones aquí descritas a la luz de su situación financiera, objetivos, horizonte y tolerancia al riesgo, debiendo consultar a sus asesores independientes antes de tomar cualquier decisión.',
    source: 'SMV Panamá — Texto Único DL 1/1999 arts. 9-10; Código de Conducta del Mercado de Valores.',
  },
  {
    id: 'B',
    category: 'general',
    tier: 'mandatory',
    title: 'Riesgo de pérdida del principal',
    body:
      'Toda inversión en valores conlleva riesgos, incluyendo la pérdida total o parcial del capital invertido. Los instrumentos descritos no constituyen depósitos bancarios, no están garantizados por Mercantil ni por ninguna entidad afiliada, y no están cubiertos por ningún seguro o fondo de garantía de depósitos.',
    source: 'SEC Marketing Rule 206(4)-1; FINRA Rule 2210; SMV — deber de información.',
  },
  {
    id: 'C',
    category: 'rendimientos',
    tier: 'mandatory',
    title: 'Rendimientos pasados no garantizan resultados futuros',
    body:
      'Los rendimientos históricos presentados no constituyen indicador confiable de resultados futuros. Las condiciones de mercado, tasas de interés, diferenciales de crédito y volatilidad pueden diferir materialmente de los períodos analizados.',
    source: 'SEC Marketing Rule §(d); FCA COBS 4.6; SMV Acuerdo 8-2014.',
  },
  {
    id: 'D',
    category: 'simulacion',
    tier: 'mandatory',
    title: 'Naturaleza hipotética de la simulación Monte Carlo',
    body:
      'Las proyecciones presentadas se obtienen mediante una simulación Monte Carlo construida con bootstrap sobre retornos históricos de los activos componentes del portafolio. Se trata de resultados estrictamente hipotéticos y de carácter ilustrativo: no reflejan rendimientos reales obtenidos por clientes de Mercantil, no constituyen pronóstico ni garantía de desempeño futuro, y dependen críticamente de asunciones —incluyendo la estabilidad de las distribuciones de retornos, correlaciones entre clases de activos y ausencia de eventos extremos no observados en la ventana histórica— que podrían no materializarse. Los percentiles P5, P50 y P95 representan rangos estadísticos del modelo bajo dichas asunciones y no deben interpretarse como límites máximos o mínimos garantizados de pérdida o ganancia. Los retornos simulados se presentan en términos brutos, sin incorporar comisiones de gestión, custodia, intermediación, TER de los ETFs subyacentes, impuestos de retención, impuestos personales del inversionista ni el costo financiero del apalancamiento cuando aplique; la inclusión de dichos costos reducirá los retornos netos efectivos. Toda inversión está sujeta a riesgo de pérdida del capital, y Mercantil no garantiza la consecución de los objetivos financieros, niveles de ingreso, valor terminal ni probabilidades de éxito derivadas de esta simulación.',
    source: 'SEC Marketing Rule 206(4)-1(d); CFA Standard III(D); boilerplate JP Morgan PB / Vanguard / Schwab; BlackRock Aladdin Wealth disclosures.',
  },
  {
    id: 'E',
    category: 'productos',
    tier: 'mandatory',
    title: 'Restricción de venta a US Persons (ETFs UCITS)',
    body:
      'Los ETFs UCITS referidos en este estudio (incluyendo iShares iBonds) no han sido registrados bajo el U.S. Securities Act de 1933 y no podrán ser ofrecidos, vendidos o entregados, directa o indirectamente, en los Estados Unidos de América ni a, o por cuenta o beneficio de, "US Persons" según se define en la Regulation S. El cliente declara no calificar como US Person y asume la responsabilidad de notificar cualquier cambio en dicho estatus.',
    source: 'US Securities Act 1933 — Regulation S; folletos iShares iBonds UCITS.',
  },
  {
    id: 'F',
    category: 'productos',
    tier: 'mandatory',
    title: 'Riesgo de contraparte en ETNs (CAPE)',
    body:
      'Los Exchange-Traded Notes (ETN) son obligaciones de deuda no garantizadas y no aseguradas del emisor (Barclays Bank PLC en el caso de CAPE). El pago de principal e intereses depende íntegramente de la capacidad y voluntad del emisor de cumplir sus obligaciones; un deterioro en la calidad crediticia del emisor, un evento de incumplimiento o el ejercicio de poderes de "bail-in" bajo legislación del Reino Unido podrían resultar en pérdida total de la inversión, independientemente del comportamiento del índice subyacente.',
    source: 'Barclays ETN Prospectus; SEC Form FWP filings.',
  },
  {
    id: 'G',
    category: 'apalancamiento',
    tier: 'mandatory',
    title: 'Riesgos del apalancamiento bancario',
    body:
      'La estrategia con apalancamiento bancario amplifica tanto las ganancias como las pérdidas potenciales del portafolio. Una caída en el valor de los activos garantes puede activar una llamada de margen o reposición de garantías ("margin call"), pudiendo el banco exigir el aporte de fondos adicionales o liquidar activos de la cuenta —sin previo aviso y sin que el cliente pueda seleccionar los activos a liquidar— para cubrir el saldo deudor. El cliente puede llegar a perder más capital del invertido inicialmente y permanecer responsable por cualquier saldo remanente luego de la liquidación. El costo del préstamo (tasa de interés) puede variar y reducir o eliminar el diferencial esperado frente al rendimiento de los activos.',
    source: 'FINRA Rule 2264; SEC Investor Bulletin sobre Securities-Based Lending.',
  },
  {
    id: 'H',
    category: 'general',
    tier: 'mandatory',
    title: 'Limitación de responsabilidad y fuentes',
    body:
      'La información proviene de fuentes consideradas confiables; sin embargo, Mercantil no garantiza su exactitud, integridad o vigencia, y no asume responsabilidad por errores, omisiones o por las decisiones que el cliente adopte con base en la misma. Mercantil no garantiza la consecución de los objetivos de inversión planteados.',
    source: 'JP Morgan Private Bank Legal Disclaimer (NAM); BlackRock boilerplate.',
  },

  // ---- RECOMENDADOS ----
  {
    id: 'I',
    category: 'simulacion',
    tier: 'recommended',
    title: 'Costos, comisiones e impuestos no incluidos',
    body:
      'Salvo indicación expresa en contrario, los rendimientos simulados se presentan en términos brutos y no reflejan la deducción de comisiones de custodia, corretaje, asesoría, fees del ETF (TER), spreads de ejecución, impuestos de retención (withholding tax) sobre dividendos o cupones, ni impuestos personales o corporativos del inversionista. La inclusión de dichos costos reducirá los retornos efectivamente percibidos.',
    source: 'SEC Marketing Rule — net vs gross; GIPS 2020.',
  },
  {
    id: 'J',
    category: 'simulacion',
    tier: 'recommended',
    title: 'Asunciones del modelo y bootstrap histórico',
    body:
      'El motor de simulación utiliza bootstrap histórico sobre una ventana de retornos pasados; los resultados son sensibles a la ventana seleccionada, a la frecuencia de los datos, a la asunción de independencia entre observaciones y al supuesto implícito de que la distribución conjunta futura se asemejará a la histórica. Cambios estructurales en políticas monetarias, regímenes inflacionarios o correlaciones entre clases de activos pueden invalidar dichas asunciones.',
    source: 'CFA Standard III(D); SEC Marketing Rule.',
  },
  {
    id: 'K',
    category: 'general',
    tier: 'recommended',
    title: 'Conflicto de interés y productos propios',
    body:
      'Mercantil y sus afiliadas pueden recibir comisiones, retrocesiones o ingresos por la intermediación, custodia o distribución de los productos referidos. Estos conflictos de interés son gestionados conforme a las políticas internas y al Código de Conducta del Mercado de Valores aplicable en la República de Panamá.',
    source: 'SMV Código de Conducta del Mercado de Valores; CFA Standard VI.',
  },
  {
    id: 'L',
    category: 'productos',
    tier: 'recommended',
    title: 'Riesgo cambiario',
    body:
      'Los instrumentos denominados en moneda distinta a la moneda funcional del cliente exponen a riesgo de tipo de cambio, el cual puede incrementar o reducir el rendimiento efectivo medido en dicha moneda.',
    source: 'Industria estándar offshore.',
  },
  {
    id: 'M',
    category: 'productos',
    tier: 'recommended',
    title: 'Riesgo de liquidez de ETFs UCITS',
    body:
      'Algunos ETFs UCITS empleados pueden presentar volúmenes de negociación reducidos en el mercado secundario; el cliente podría enfrentar diferenciales de compra-venta (bid-ask spreads) más amplios o demoras en la ejecución, particularmente en condiciones de estrés de mercado.',
    source: 'ESMA guidelines; práctica común.',
  },
  {
    id: 'N',
    category: 'limitaciones',
    tier: 'recommended',
    title: 'Vigencia del estudio',
    body:
      'La asignación propuesta y las cifras presentadas reflejan condiciones de mercado y precios indicativos a la fecha indicada en la portada. Su validez es limitada en el tiempo y deberá ser revisada y, en su caso, actualizada, antes de la implementación.',
    source: 'Industria estándar.',
  },
];

/** Texto específico para mix custom de equity con proxies históricos (SPMO, CAPE). */
export const PROXY_DISCLAIMER =
  'Para extender la profundidad histórica utilizada en la simulación, algunos componentes con vida de cotización corta han sido reconstruidos mediante series proxy que combinan el track record real del ETF con un índice o ETF antecesor de exposición económicamente equivalente (por ejemplo, SPMO con PDP previo a su inception, CAPE con RPV o índice análogo en el período anterior). Esta técnica de empalme ("splicing") es de uso estándar en la industria de análisis cuantitativo y permite estimar el comportamiento estadístico de la estrategia en regímenes de mercado más amplios; no obstante, el ETF proxy y el ETF actual pueden diferir en metodología, ponderación, costos y tracking error, por lo que la serie reconstruida representa una aproximación y no un track record real del instrumento finalmente recomendado.';

/** Mini-disclaimer compacto para la portada (sección A) — versión corta. */
export const COVER_MINI_DISCLAIMER =
  'Documento confidencial preparado exclusivamente para el cliente identificado. No constituye oferta ni asesoría personalizada. Ver advertencias completas en el Apéndice del documento.';

export const DISCLAIMER_CATEGORY_LABELS: Record<DisclaimerCategory, string> = {
  general: 'Generales',
  rendimientos: 'Rendimientos históricos',
  simulacion: 'Simulación y proyecciones',
  apalancamiento: 'Apalancamiento bancario',
  productos: 'Productos específicos',
  limitaciones: 'Limitaciones y vigencia',
};
