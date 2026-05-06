# Dossier de Research — PDF de Cierre / Investment Policy Statement en Wealth Management Top-Tier

**Proyecto:** Mercantil Planner — Mercantil AWM
**Audiencia:** equipo de diseño y producto del entregable PDF de cierre de asesoría
**Fecha del documento:** 2026-05-05
**Autor del research:** asistente de research, agente paralelo
**Propósito:** establecer un marco basado en evidencia para diseñar el PDF entregable que el asesor de Mercantil AWM entrega al cliente final al cierre de cada sesión, con foco en (a) cumplir lo que la industria considera estándar profesional, (b) diferenciar por rigor estadístico (block bootstrap pareado vs Monte Carlo gaussiano), y (c) incrustar metadata reproducible (JSON de estado) para retomar la próxima sesión.

> **Nota de método.** Este dossier se construyó vía búsquedas web sistemáticas (24+ queries) y descarga / extracción de PDFs públicos. Donde fue posible se citan pasajes textuales con su URL fuente. Las firmas top-tier no publican generalmente el documento "real" entregado al cliente (es confidencial) — pero sí publican los **brochures regulatorios (Form ADV Part 2)**, **whitepapers** que describen su metodología y framework, **plantillas IPS** para fundaciones, y **sample plans** de planificadores fee-only. Esos son los materiales utilizados.

---

## Tabla de contenidos

1. [Plantillas IPS de CFA Institute y CFP Board](#1-plantillas-ips-de-cfa-institute-y-cfp-board)
2. [Ejemplos públicos de top-tier (Vanguard, JPMorgan, Morgan Stanley, UBS, Schwab, Northern Trust, Fidelity)](#2-ejemplos-públicos-top-tier)
3. [Disclaimers regulatorios estándar (SEC, FINRA, MiFID II, CNMV, AMF)](#3-disclaimers-regulatorios-estándar)
4. [Visualización de probabilidades y Monte Carlo para cliente no-financiero](#4-visualización-de-probabilidades-y-monte-carlo-para-cliente-no-financiero)
5. [Estructura modular y checklist de secciones](#5-estructura-modular-y-checklist-de-secciones)
6. [Acuerdos de seguimiento / monitoring agreements](#6-acuerdos-de-seguimiento--monitoring-agreements)
7. [Lenguaje cliente no-técnico — guía de redacción](#7-lenguaje-cliente-no-técnico--guía-de-redacción)
8. [Recomendaciones de diferenciación de Mercantil Planner](#8-recomendaciones-de-diferenciación-de-mercantil-planner)
9. [**Recomendación de estructura para el PDF de Mercantil Planner**](#9-recomendación-de-estructura-para-el-pdf-de-mercantil-planner)

---

## 1. Plantillas IPS de CFA Institute y CFP Board

### 1.1 El estándar normativo: "Elements of an Investment Policy Statement for Individual Investors" — CFA Institute (2010, vigente)

CFA Institute publicó en mayo de 2010 el documento **"Elements of an Investment Policy Statement for Individual Investors"** (ISBN 978-0-938367-31-4), que constituye la referencia mundial canónica para IPS de personas físicas en banca privada / wealth management. [PDF oficial](https://rpc.cfainstitute.org/sites/default/files/-/media/documents/article/position-paper/investment-policy-statement-individual-investors.pdf).

> Cita textual del documento (pp. 1): *"The investment policy statement (IPS) serves as a strategic guide to the planning and implementation of an investment program. (...) Perhaps most importantly, the IPS serves as a policy guide that can offer an objective course of action to be followed during periods of market disruption when emotional or instinctive responses might otherwise motivate less prudent actions."*

> Cita textual (p. 1): *"The IPS is a highly customized document that is uniquely tailored to the preferences, attitudes, and situation of each investor. Templates that purport to offer convenience and ease in development of an IPS almost inevitably sacrifice consideration of factors that are highly relevant to the investor."*

**Estructura canónica de 4 bloques + 11 sub-secciones obligatorias:**

| # | Sección | Sub-componentes |
|---|---------|-----------------|
| 1 | **Scope and Purpose** | 1a. Definir contexto (origen del patrimonio, historia familiar). 1b. Definir al inversor (persona física, fideicomiso, cuentas cubiertas). 1c. Definir la estructura (responsabilidades, "standard of care" — fiduciario vs idoneidad, organización para invertir, monitoreo, **firma de aceptación**). |
| 2 | **Governance** | 2a. Quién determina, ejecuta y monitorea la política. 2b. Proceso de revisión y actualización. 2c. Responsabilidad de contratar/despedir asesores externos. 2d. Asignación de responsabilidad sobre asset allocation, **incluyendo inputs y supuestos del modelo**. 2e. Responsabilidad de gestión de riesgo, monitoreo y reporting. |
| 3 | **Investment, Return, and Risk Objectives** | 3a. Objetivo general de la inversión. 3b. Requisitos de retorno, distribución y riesgo (con el famoso ejemplo de "spending calculus": retorno esperado − fees − inflación − tasa fiscal = tasa de retiro sostenible). 3c. Definición de tolerancia al riesgo (CFA explícitamente reconoce que "volatility" puede ser irrelevante más allá del nivel absoluto de pérdida que descarrila el plan). 3d. Restricciones (horizonte, liquidez, fiscal, legal, leverage, divisas). 3e. Otras consideraciones (filosofía de inversión, voto en proxies, securities lending, ESG). |
| 4 | **Risk Management** | 4a. Reportes de performance (consistentes con GIPS). 4b. Métricas de riesgo (volatilidad anualizada vs benchmark, information ratio). 4c. **Política de rebalanceo** con bandas y triggers. |

**Lecciones de redacción del CFA**:
- Cada sub-sección incluye un *"Example"* en cursiva con redacción concreta para cliente. Estos ejemplos usan nombres ficticios ("Leveaux Family Trusts", "Mr. Chen Guangping", "James and Jennifer Jensen") y son redactados en estilo legal-narrativo accesible.
- CFA recomienda que el **asset allocation plan vaya como apéndice**, no en el cuerpo principal, para permitir actualizarlo sin reescribir todo el IPS.
- El documento **debe ser firmado** ("By their signatures below, the Xien Trust trustees and LLL Investment Counsel acknowledge both receipt of this document and acceptance of its content").
- Tolerancia al riesgo debe expresarse como **límite absoluto de pérdida** ("an absolute loss in any 12-month period of more than 33 percent is intolerable"), no solo como volatilidad.

### 1.2 CFP Board — perspectiva complementaria

El CFP Board no publica una plantilla obligatoria pero sus *learning objectives* en planificación de inversiones [(documento PDF)](https://www.cfp.net/-/media/files/cfp-board/education-partners/ce-sponsors/general/cfp-board-pkt-learning-objectives---investment-planning.pdf) y la práctica industrial coinciden en estos componentes esenciales para el IPS individual:
- Objetivo de inversión (crecimiento / ingresos / preservación)
- Horizonte temporal
- Necesidades de ingreso
- Asignación de activos deseada
- Necesidad de liquidez
- Filosofía de inversión (activa vs pasiva, exclusiones)

Fuente referenciada: [Center for Financial Planning — What are IPS](https://www.centerfinplan.com/money-centered/2017/5/9/what-are-investment-policy-statements) y [Define Financial — IPS guide](https://www.definefinancial.com/blog/investment-policy-statement-defined/).

### 1.3 Plantilla institucional — JPMorgan / Simpson Thacher (2021)

JPMorgan distribuye una **plantilla IPS para instituciones** redactada por el bufete Simpson Thacher & Bartlett LLP [(NCFP — JP Morgan IPS Template 2021)](https://www.ncfp.org/wp-content/uploads/2021/08/Investment-Policy-Statement-Template-JP-Morgan-2021.pdf). Aunque está orientada a fundaciones, su estructura es revelatoria del estándar JPMorgan:

**12 secciones jerárquicas:**
1. General (Purpose + Investment Committee Review)
2. The Investment Committee (composición, reuniones, deberes)
3. Investment Staff
4. Investment Advisors and Investment Managers
5. Investment Objective and Considerations (objetivo + Legal Considerations + Investment Managers + Volatility)
6. Asset Allocation
7. Asset Classes (Global Equity, Global Fixed Income, Cash, Alternative Investments)
8. Investment Restrictions (Diversificación, Derivatives, Leverage, Liquidity)
9. Performance Evaluation and Benchmarks
10. Communications and Reports from Investment Managers
11. **Conflicts of Interest** (sección extensa con políticas detalladas)
12. Confidentiality
+ Exhibit A: Strategic Asset Allocation table
+ Exhibit B: Annual Investment Conflict of Interest Disclosure Statement (formulario firmado)

> Cita textual del JPM IPS template (Sección XI.A): *"This Section of the Investment Policy is intended to provide the Investment Committee with a policy and procedure for addressing conflicts of interest that may arise in connection with the Investment Committee's discharging of its duties and responsibilities."*

**Lección clave de JPMorgan**: el rigor en el tratamiento de conflictos de interés (Sección XI completa, ~6 páginas) y la inclusión de un **anexo firmable** con disclosure anual de conflictos. Es nivel "fiduciary best practice".

---

## 2. Ejemplos públicos top-tier

### 2.1 Vanguard Personal Advisor Wealth Management

Vanguard publica anualmente su **Form ADV Part 2** ([versión VNTC](https://personal1.vanguard.com/pdf/vntcbroc.pdf), 30 marzo 2026, 27 páginas; [versión VPA](https://personal1.vanguard.com/pdf/vpabroc.pdf)). Son los documentos legales más completos públicamente disponibles sobre el deliverable de un asesor wealth top-tier.

**Estructura del brochure (deliverable visible al cliente):**
1. Advisory business
2. Fees and compensation
3. Performance-based fees and side-by-side management
4. Types of clients
5. **Methods of analysis, investment strategies, and risk of loss** (sección central)
6. Disciplinary information
7. Other financial industry activities and affiliations
8. Code of ethics, participation or interest in client transactions, and personal trading
9. Brokerage practices
10. Review of accounts
11. Client referrals and other compensation
12. Custody
13. Investment discretion
14. Voting client securities
15. Financial information
16. Investment risks (anexo con cada riesgo por asset class)

**Vanguard Capital Markets Model (VCMM) — el motor de proyecciones probabilísticas** [(p. 17 del brochure VNTC)](https://personal1.vanguard.com/pdf/vntcbroc.pdf):

> Cita textual: *"To cover a broad range of outcomes, our forecasts will generate 10,000 scenarios to measure your likelihood of success in reaching your goals."*

> Cita textual de la metodología: *"At the core of the model are estimates of the dynamic statistical relationship between risk factors and asset returns, obtained from statistical analysis based on available monthly financial and economic data from as early as 1960. (...) the model then applies a Monte Carlo simulation method to project the estimated interrelationships among risk factors and asset classes as well as uncertainty and randomness over time."*

> Cita textual sobre las limitaciones (Vanguard es muy honesto): *"It is important to recognize that the VCMM does not impose 'normality' on the return distributions, but rather is influenced by the so-called fat tails and skewness in the empirical distribution of modeled asset-class returns."*

> Cita textual del disclaimer obligatorio: *"IMPORTANT: The projections and other information generated by the Vanguard Capital Markets Model (VCMM) regarding the likelihood of various investment outcomes are hypothetical in nature, do not reflect actual investment results, and are not guarantees of future results. VCMM results will vary with each use and over time. The VCMM projections are based on a statistical analysis of historical data. Future returns may behave differently from the historical patterns captured in the VCMM. More importantly, the VCMM may be underestimating extreme negative scenarios unobserved in the historical period on which the model estimation is based."*

**Cómo Vanguard expresa la "probabilidad de éxito"** (p. 16):
- Para custom goals: *"The calculations will be performed with the aim of estimating a sum that'll allow you to meet your spending needs in 85% of the Monte Carlo simulations (which means we estimate that in 85% of the hypothetical scenarios projected, you'll have at least $1 left at the end of the spending phase)."*
- Para retirement: *"The overall likelihood-of-success measure for your retirement goal represents the percentage of the 10,000 hypothetical scenarios in which your balance in your retirement accounts is at least $1 at the end of the planning horizon, which is usually set to age 100 as our default."*

**Lecciones Vanguard:**
- Definición operativa de éxito = "$1 al final del horizonte" en X% de los escenarios. Es una convención muy concreta y replicable.
- El motor genera 10.000 escenarios — número canónico de la industria.
- Vanguard reduce los retornos esperados en 0.50% para equity/fixed income y 0.20% para cash *para representar fees y costos hipotéticos*. Es buena práctica de honestidad metodológica.
- Tienen el modelo "Dynamic Spending" para retirados: ajusta el gasto anual según fluctuaciones del balance trianual con bandas. Esto es relevante para regímenes adversos.

### 2.2 Morgan Stanley Goals Planning System (GPS)

Morgan Stanley estructura su entregable alrededor de **goals-based planning** con un report llamado *GPS Update Report* [(sample público)](https://advisor.morganstanley.com/the-cornerstone-group-milwaukee/documents/field/c/co/cornerstone-group-milwaukee/GPS_Sample_Report.pdf). El framework comunica:
- Vínculo entre información financiera y prioridades del cliente.
- Visualización de progreso hacia goals (cliente puede tracker en Morgan Stanley Online).
- Estudio interno de Morgan Stanley: durante el crash 2020, **>75% de clientes con GPS se mantuvieron en el plan** en el punto más bajo del mercado. Es un dato muy potente de marketing del valor del proceso.

> Disclaimer estándar de Morgan Stanley GPS: *"The reports generated from Morgan Stanley Wealth Management are not financial plans nor constitute a financial planning service. (...) Financial forecasts, rates of return, risk, inflation, and other assumptions may be used as the basis for illustrations generated by the Morgan Stanley GPS Platform, but they should not be considered a guarantee of future performance or a guarantee of achieving overall financial objectives."* Fuente: [Morgan Stanley Goals Planning](https://www.morganstanley.com/articles/goals-based-financial-planning).

### 2.3 UBS Wealth Way — el framework "Liquidity. Longevity. Legacy."

El whitepaper bandera de UBS, **"UBS Wealth Way: A purpose-based approach to managing your wealth"** (octubre 2024, 47 páginas) [PDF oficial](https://www.ubs.com/us/en/wealth-management/our-approach/ubs-wealth-way), establece el framework más sofisticado de la industria para segmentar el patrimonio de un cliente.

**Estructura del whitepaper:**
1. Foreword (firmado por CIO Americas + Head of Portfolio Strategy)
2. Chapter 1 — Our approach (el framework Liquidity / Longevity / Legacy)
3. Chapter 2 — How UBS Wealth Way builds on classic investment approaches (MPT, LDI, endowment, behavioral finance)
4. Chapter 3 — Benefits of the framework (Improved performance, Managing bear market risk, Tax efficiency, Behavioral biases)
5. Chapter 4 — Managing the strategies (cómo dimensionar y operar cada uno)
6. Conclusion
7. Strategic Asset Allocation tables
8. Endnotes
9. Bibliography (~30 referencias académicas: Markowitz, Merton, Milevsky, Pfau, Kitces, Tversky/Kahneman, Thaler)
10. **Important Information and Disclosures** (5 páginas: securities-backed lending, alternativos, hedge funds, real estate, private equity, FX risk)
11. Disclaimer

**El framework Liquidity. Longevity. Legacy.** (de UBS Wealth Way, p. 4):

| Estrategia | Horizonte | Propósito | Composición |
|------------|-----------|-----------|-------------|
| **Liquidity** | Próximos 3-5 años | Mantener el estilo de vida sin ser forzado a vender en bear markets | Cash, savings accounts, high-quality fixed income, CD/bond ladder |
| **Longevity** | Resto de la vida | Mejorar el estilo de vida; financiar gastos vitalicios con alta probabilidad de éxito | Portafolio balanceado y diversificado, growth + income |
| **Legacy** | Más allá de la vida | Mejorar la vida de otros (herencia, filantropía) | Portafolio agresivo con alta exposición a riesgo, alternativos |

> Cita textual UBS (p. 3, foreword): *"Investing is a deeply personal undertaking, which is why we always start with a discussion about what's most important to you."*

> Cita textual del framework (p. 4): *"To fund the Longevity strategy, we recommend using a financial plan to assess how much wealth you need to meet your lifetime goals with a high probability of success, even if you experience a series of poor market returns."*

**Cómo UBS visualiza bear markets en el documento del cliente** (Tabla en p. ~25, basada en bear markets desde 1945):

| Pico | 1947 | 1962 | 1969 | 1973 | 1988 | 2001 | 2008 | 2020 | 2022 | Promedio |
|------|------|------|------|------|------|------|------|------|------|----------|
| Max drawdown S&P 500 | −21.8% | −22.3% | −29.4% | −42.6% | −29.6% | −44.7% | −51.0% | −19.6% | (datos) | −31.6% |
| Tiempo de drawdown | 0.5 yrs | 0.5 yrs | 1.6 yrs | 1.8 yrs | 0.3 yrs | 2.1 yrs | 1.3 yrs | 0.3 yrs | (datos) | promedio |

UBS muestra esto al cliente para **calibrar expectativas históricas reales**. Es exactamente el tipo de tabla que Mercantil Planner debe replicar usando sus regímenes históricos (2008, COVID, Estanflación 73-82).

**Disclaimer UBS — pasaje clave que sirve de boilerplate** (p. 47):
> *"This publication is for your information only and is not intended as an offer, or a solicitation of an offer, to buy or sell any investment or other specific product. The analysis contained herein does not constitute a personal recommendation or take into account the particular investment objectives, investment strategies, financial situation and needs of any specific recipient. It is based on numerous assumptions. Different assumptions could result in materially different results."*

### 2.4 Schwab Wealth Advisory

Schwab publica [sample scenarios públicos](https://www.schwab.com/wealth-management/wealth-advisor/sample-scenarios) que ilustran su deliverable. La estructura del plan Schwab cubre:
- Goals-based portfolios y recomendaciones accionables que consideran un rango amplio de vehículos de inversión.
- Estrategias tax-smart (IRA conversions, distribuciones, capital gains).
- Guidance sobre titling, beneficiarios, ejecutores/trustees, distribución de activos, charitable giving.

Schwab pone énfasis en la **adaptación continua del plan a cambios** del cliente. Su filosofía: el plan no es un documento, es una conversación recurrente.

### 2.5 Northern Trust

Northern Trust opera con un *disciplined investment process that includes ongoing monitoring and reporting tailored to clients' needs*. Su [Form CRS](https://www.northerntrust.com/content/dam/northerntrust/pws/nt/documents/wealth-management/form-crs.pdf) es referencia para boilerplate fiduciario. Northern Trust sirve >40.000 clientes incluyendo fundaciones soberanas, lo que da peso institucional al estándar.

### 2.6 JPMorgan Private Bank

JPMorgan Private Bank no publica el documento exacto entregado al cliente, pero sí publica su **Chief Investment Office Annual Outlook** y su [2025 portfolio review and outlook](https://privatebank.jpmorgan.com/eur/en/insights/markets-and-investing/chief-investment-office-2025-portfolio-review-and-outlook). El estándar JPM se caracteriza por:
- Estrategia bespoke por cliente con asset allocation personalizada.
- Tratamiento detallado de conflictos de interés (visible en su IPS template).
- Vinculación estricta con resources del firm completo.

### 2.7 Sample Family Financial Plan (Andrew Marshall Financial / fee-only)

[Andrew Marshall Financial sample plan](https://andrewmarshallfinancial.com/sample-financial-plan/) — útil como referencia "ground truth" de lo que un fee-only fiduciario entrega:

1. Current Financial Position
2. Planning Assumptions (inflación, retornos, ahorros, expectativa de vida)
3. **Monte Carlo Analysis** (proyección hasta edad 95)
4. Baseline Scenario
5. Social Security Strategy
6. Investment Review & Analysis (cuenta por cuenta)
7. Pension Analysis
8. Roth Conversion Strategy (con charts de impacto)
9. Safe Spending Analysis (gasto sostenible máximo)
10. Long-Term Care Insurance (riesgo + análisis de auto-financiamiento)

Cada sección incluye *written discussions, charts and diagrams supporting recommendations, comparative tables y action items*.

### 2.8 Tabla comparativa de las firmas top-tier

| Firma | Documento público disponible | Framework distintivo | Motor probabilístico |
|-------|-------------------------------|----------------------|----------------------|
| Vanguard | Form ADV Part 2 (27 pp) + Service Agreement | "4 Totals" passive index core | VCMM, 10.000 escenarios, fat tails |
| Morgan Stanley | GPS sample reports vía advisors | Goals Planning System (GPS) | "Multiple market scenarios" |
| UBS | Wealth Way 2024 whitepaper (47 pp) | Liquidity / Longevity / Legacy | Probability of success + funding ratio |
| JPMorgan PB | CIO Annual Outlook + IPS institutional template | Bespoke + Conflict mgmt | Internal modeling |
| Schwab | Sample scenarios + financial plan tool | Goals-based, tax-smart | Schwab Plan tool |
| Northern Trust | Form CRS + family office whitepaper | Multi-generational + disciplined | NT Wealth Mgmt program |
| Fidelity | Wealth planning workbooks + Personal Retirement Roadmap | Income for life | Internal Monte Carlo |

---

## 3. Disclaimers regulatorios estándar

### 3.1 SEC / FINRA (USA) — Marketing Rule (vigente desde noviembre 2022)

Bajo **17 CFR § 275.206(4)-1** [(texto Cornell Law)](https://www.law.cornell.edu/cfr/text/17/275.206(4)-1), las RIA registradas en SEC deben para cualquier *hypothetical performance*:

> *"For hypothetical performance (excluding performance generated by interactive analysis tools), the investment adviser must provide information sufficient to enable the intended audience to understand the criteria used and assumptions made in calculating the hypothetical performance, along with the risks and limitations of using such hypothetical performance, and must adopt policies and procedures reasonably designed to ensure that the hypothetical performance is relevant to the likely financial situation and investment objectives of the target audience."*

**Implicación para Mercantil Planner**: cualquier proyección que se entregue al cliente debe incluir:
- Criterios usados (block bootstrap pareado, ventana histórica, número de escenarios)
- Supuestos (inflación asumida, fees, capital markets assumptions)
- Riesgos y limitaciones (la historia no se repite, fat tails posibles, etc.)
- Disclosure de que la proyección es relevante al perfil específico del cliente

### 3.2 Forward-Looking Statement boilerplate

Boilerplate típico aceptado por la industria USA para forward-looking statements [(Corporate Finance Institute reference)](https://corporatefinanceinstitute.com/resources/accounting/forward-looking-statements-example/):

> *"Words such as 'estimate,' 'project,' 'believe,' 'anticipate,' 'intend,' and 'expect' are intended to identify forward-looking statements. (...) Forward-looking statements are based on what management believes are reasonable assumptions, but there can be no assurance they will prove accurate, as actual results and future events could differ materially from those anticipated. (...) The firm undertakes no obligation to update forward-looking statements if circumstances or estimates should change except as required by applicable securities laws."*

**Cuidado crítico**: jurisprudencia USA reciente exige que el boilerplate **NO sea genérico**: *"cautionary statements must be substantive and tailored to the specific future projections, estimates or opinions"* [(Venable LLP, 2024)](https://www.venable.com/insights/publications/2024/09/forward-looking-statements-safe-harbors-comp). El disclaimer debe estar customizado a la simulación específica que se está entregando.

### 3.3 MiFID II (Unión Europea) — Suitability requirements

Las **ESMA Guidelines on certain aspects of the MiFID II suitability requirements** (versión 2023) [(PDF ESMA)](https://www.esma.europa.eu/sites/default/files/2023-04/ESMA35-43-3172_Guidelines_on_certain_aspects_of_the_MiFID_II_suitability_requirements.pdf) requieren:

- Reporte de idoneidad antes de cualquier transacción.
- Documentación de las preferencias de sostenibilidad del cliente (post-2022).
- Reporte periódico actualizado para clientes con portfolio management o evaluación periódica de idoneidad.
- *"The periodic report shall contain an updated statement of how the investment meets the client's preferences, objectives and other characteristics of the retail client."*

### 3.4 PRIIPs KID (Unión Europea, vigente desde 2018)

El **Key Information Document** [(EU regulation overview)](https://finance.ec.europa.eu/consumer-finance-and-payments/retail-financial-services/key-information-documents-packaged-retail-and-insurance-based-investment-products-priips_en) es máximo 3 páginas A4 con: descripción del producto, costes, perfil riesgo-recompensa, escenarios de performance posibles. Estándares de redacción:

> *"...short document with a maximum of three sides of A4-sized paper that shall be easy to read, focus on the relevant key information for retail investors, and be in clear, succinct and comprehensive language."*

**Es la mejor referencia de la industria europea sobre cómo comprimir información compleja en lenguaje accesible.**

### 3.5 CNMV (España) — Informe de idoneidad

CNMV exige [(Guía MiFID G04)](https://www.cnmv.es/DocPortal/Publicaciones/Guias/G04_MiFID.pdf) que el informe de idoneidad incluya **tres componentes obligatorios** descriptivos:
1. Adecuación a conocimientos y experiencia del cliente
2. Adecuación a situación financiera y objetivos de inversión
3. **Principales riesgos del producto** (riesgo de mercado, liquidez, crédito)

> Cita CNMV: *"Las entidades deben proporcionar al cliente por escrito o mediante otro soporte duradero una descripción de cómo se ajustan las recomendaciones a las características y objetivos del inversor."*

Adicionalmente, la **Circular 1/2018 de la CNMV** [(BOE)](https://www.boe.es/buscar/act.php?id=BOE-A-2018-4247) regula advertencias específicas sobre instrumentos financieros complejos.

### 3.6 AMF / DICI / DIC (Francia)

El antiguo **DICI** (Document d'Information Clé pour l'Investisseur) fue reemplazado el 1 enero 2023 por el **DIC** bajo regulación PRIIPs [(AMF)](https://www.amf-france.org/en). El DIC tiene los mismos requisitos PRIIPs europeos.

### 3.7 BaFin (Alemania) — Anlagerichtlinie

En el mundo germano-suizo, el equivalente al IPS se denomina **Anlagerichtlinie** [(Gabler Banklexikon)](https://www.gabler-banklexikon.de/definition/vermoegensverwaltung-anlagerichtlinie-62296). Operacionaliza preferencias riesgo-retorno con asignación concreta por tipo (renta fija, acciones), sector y geografía.

### 3.8 Disclaimers concretos de top-tier — 4 ejemplos textuales

**Ejemplo 1 — Vanguard VCMM** (Form ADV VNTC 2026):
> *"IMPORTANT: The projections and other information generated by the Vanguard Capital Markets Model (VCMM) regarding the likelihood of various investment outcomes are hypothetical in nature, do not reflect actual investment results, and are not guarantees of future results. VCMM results will vary with each use and over time. The VCMM projections are based on a statistical analysis of historical data."*

**Ejemplo 2 — UBS Wealth Way** (octubre 2024, p. 47):
> *"This publication is for your information only and is not intended as an offer, or a solicitation of an offer, to buy or sell any investment or other specific product. The analysis contained herein does not constitute a personal recommendation or take into account the particular investment objectives, investment strategies, financial situation and needs of any specific recipient. It is based on numerous assumptions. Different assumptions could result in materially different results."*

**Ejemplo 3 — Morgan Stanley GPS**:
> *"Financial forecasts, rates of return, risk, inflation, and other assumptions may be used as the basis for illustrations generated by the Morgan Stanley GPS Platform, but they should not be considered a guarantee of future performance or a guarantee of achieving overall financial objectives."*

**Ejemplo 4 — JPMorgan IPS template** (frontmatter):
> *"This document is intended to serve as a template investment policy for adaptation and modification by the governing board of the institution in accordance with the particular needs and circumstances of the institution. It is furnished by JPMorgan solely as an accommodation to institutions and is not intended to constitute legal or tax advice."*

### 3.9 Recomendación de conflictos de interés / fee disclosure

Best practice (consolidada de Vanguard + JPMorgan + UBS):
- Disclosure explícito de fees del asesor
- Disclosure de fees subyacentes (expense ratios de funds, cargos por brokerage)
- Disclosure de cualquier compensación relacionada (referrals, sweep accounts)
- Disclosure de conflictos: si la firma recomienda sus propios productos, decirlo
- *"We have a financial incentive to recommend the use of [X], rather than [Y], because we receive compensation related to [X]"* — formula textual de UBS

---

## 4. Visualización de probabilidades y Monte Carlo para cliente no-financiero

Esta es la sección con MAYOR debate académico-industrial actual. Hay críticas serias al uso ingenuo de Monte Carlo gaussiano, y exactamente esas críticas son la oportunidad de diferenciación de Mercantil Planner.

### 4.1 Crítica académica del Monte Carlo gaussiano tradicional

**Quant Decoded — "When Monte Carlo Fails"** [(análisis)](https://quantdecoded.com/en/when-monte-carlo-fails-retirement-planning-pitfalls) identifica 5 modos de falla del Monte Carlo estándar:

1. **Asunción de independencia (i.i.d.)**: ignora volatility clustering ("large moves tend to follow large moves"). Subestima drawdowns prolongados como 1966-1982 (S&P 500 ~−0.4% real anualizado en 16 años).
2. **Distribución normal**: cambiar de normal a Student's t (5 grados de libertad) **casi duplica la failure rate: de 11% a 22% al 4% de retiro en 60/40**.
3. **Correlaciones constantes**: las correlaciones se disparan en crisis. En 2022 bonds y stocks cayeron juntos — un escenario que el modelo de correlación negativa constante consideraría "extremadamente improbable".
4. **Independencia de inflación**: ignora escenarios como los 70's donde inflación persistente erosiona simultáneamente poder adquisitivo y retornos reales.
5. **Retornos históricos promedio**: ignora valuaciones de partida. Con CAPE > 30, los retornos a 10 años suelen estar en 0-3%, no en el 6-7% promedio histórico.

> Quant Decoded conclusion: *"Standard 85% success rates likely overstate actual security; realistic models suggest 70-75% when corrections are applied."*

### 4.2 Block Bootstrap como alternativa rigurosa (¡exactamente lo que Mercantil Planner usa!)

[Portfolio Optimizer — Bootstrap Simulation](https://portfoliooptimizer.io/blog/bootstrap-simulation-with-portfolio-optimizer-usage-for-financial-planning/) describe tres metodologías:
1. **IID Bootstrap**: simple resampling. NO apropiado para retornos financieros (preserva ninguna autocorrelación).
2. **Circular Block Bootstrap**: resampling de bloques consecutivos, preserva dependencias, wraps circular para edge cases.
3. **Stationary Block Bootstrap**: tamaño de bloque variable (distribución geométrica), garantiza estacionariedad condicional.

**Hallazgo Cogneau-Zakamouline (2013)** citado en quantdecoded: *block bootstrap produce wider left tails y aumenta failure rates estimadas vs Monte Carlo estándar. A combined model estima 28% failure rate al 4% rule vs 11% del naive Monte Carlo.* **Es decir: el Monte Carlo gaussiano está sistemáticamente subestimando el riesgo en ~17 puntos porcentuales.**

### 4.3 Crítica de Kitces a la "probabilidad de éxito" como número único

Michael Kitces — referencia industrial del lado advisory — ha publicado análisis demoledores. En *"Assessing Performance Predictiveness Of Monte Carlo Models"* (vía búsqueda web):

- Aplica el **Brier Score** (mean squared error de predicciones probabilísticas) y muestra que los modelos historical y regime-based tienen Brier scores ~25% mejores que el Monte Carlo tradicional.
- Argumenta que "an 85% probability of success" oculta sesgos. Específicamente, el Monte Carlo tradicional tiene "dry bias" (sobreconfianza) en el rango 70-97% — exactamente el rango donde los advisors suelen recomendar.
- *"For every 100 clients with a predicted 95% success rate, we would expect 5 of those clients to fail (...) but instead 20 of them would have found they were spending too much."* → el riesgo real es ~4× el aparente.

En *"Calming Client Fears: Communicating Monte Carlo Outcomes"* (Kitces, vía búsqueda):
- Reframe del lenguaje: **eliminar las palabras "Failure" y "Success"** de la conversación con cliente. Usar "adjustment-based planning".
- *"By moving away from the concepts and language of Failure and Success, the financial advisor can lessen the emotional reaction clients may have."*
- Mejor presentar: "estos son los puntos en que tendrías que ajustar el gasto / aportar más / retrasar la jubilación".

### 4.4 Best practice de visualización: alternativas a la "probabilidad %" única

**Opción A — Confidence Age (eMoney Advisor)** [(blog post)](https://emoneyadvisor.com/blog/securing-client-confidence-with-monte-carlo-simulation-in-financial-planning/):
> "Tu plan tiene éxito hasta la edad 92" en lugar de "Tu plan tiene 85% de probabilidad de éxito"

Resultado: más intuitivo, mantiene la conversación enfocada en el goal en lugar de la metodología.

**Opción B — Fan Charts (UK Bank of England, Engaging Data)**:
[(DataViz Catalogue)](https://datavizcatalogue.com/blog/chart-snapshot-fan-chart/): combina serie observada (histórica del cliente / portfolio) con range areas graduadas. Cada área sombreada representa un nivel de confianza (50%, 80%, 95%). El central oscuro = más probable; bandas exteriores = menos probable. Forma de "abanico" que se abre con el horizonte. **Es la mejor visualización para comunicar "incertidumbre creciente con el horizonte" a clientes no técnicos.**

**Opción C — Probability Cone**:
Variante geométrica del fan chart usada en options trading; menos común en wealth management retail.

**Opción D — Density plot del balance final**:
Histograma de los 10.000 escenarios al final del horizonte. Muestra la distribución completa, no solo la mediana. Útil para mostrar el spread real (cómo varían los outcomes).

**Opción E — Multiple percentile paths**:
Gráfico de líneas con percentil 5 / 25 / 50 / 75 / 95 a lo largo del tiempo. Cliente ve "el peor caso", "el caso medio", "el mejor caso".

### 4.5 Qué métricas se quedan, qué se simplifica

**Para el cliente final (PDF entregable):**
- ✅ Probabilidad de éxito en 1 número grande (con definición operativa: "$1 al final del horizonte")
- ✅ Fan chart o probability cone del balance proyectado
- ✅ Drawdown máximo histórico simulado (con régimen específico, ej. "2008")
- ✅ Tiempo de recuperación esperado tras un drawdown
- ✅ "Confidence age" como traducción intuitiva
- ❌ Sharpe ratio (técnico)
- ❌ Information ratio (técnico)
- ❌ Tracking error (técnico)
- ⚠️ VaR / CVaR (solo si el cliente es sofisticado)

**Para el apéndice / "para quien quiera detalles":**
- Volatilidad anualizada
- Expected return + std dev
- Correlaciones entre activos
- Capital markets assumptions
- Detalles del bootstrap (tamaño de bloque, número de escenarios)
- Seed reproducible

### 4.6 El caso de estudio: la "polémica del Monte Carlo en advisor reports"

La industria USA tuvo un debate público intenso 2018-2024 sobre si el Monte Carlo "engañaba" a los clientes con falsa precisión. Resúmenes:

**Crítica académica (Pfau, Kitces, Estrada)**: el Monte Carlo gaussiano subestima sistemáticamente el riesgo de cola y la probabilidad de "lost decades". El 4% rule fue establecido vía análisis histórico (Bengen 1994), no vía Monte Carlo, precisamente porque los datos históricos contienen los regímenes adversos que el modelo paramétrico nunca generaría.

**Respuesta de la industria**: incorporación progresiva de bootstrap histórico, regime-switching, y *"realistic capital markets assumptions"* (Vanguard CMA, BlackRock CMA, JPM LTCMA). Vanguard explícitamente dice en su brochure: *"the VCMM may be underestimating extreme negative scenarios unobserved in the historical period on which the model estimation is based."* Es honestidad metodológica.

**El estándar emergente (2023-2026)**:
- Múltiples engines en paralelo (Monte Carlo + bootstrap + regime-switching + escenarios deterministas)
- Comunicación al cliente del rango de outcomes, no del punto central
- Desplazamiento del lenguaje de "probabilidad de éxito" a "qué ajustes tendrías que hacer si ocurre X"
- Auditabilidad metodológica creciente (seed, parámetros, fuente de datos)

**Mercantil Planner está alineado con el estándar emergente**, ya que usa block bootstrap pareado, no Monte Carlo gaussiano. Esto debe destacarse en el PDF.

---

## 5. Estructura modular y checklist de secciones

Síntesis de las 8 firmas analizadas, normalizada al caso de un cliente individual de wealth management.

### 5.1 Secciones core obligatorias (todas las firmas top-tier las tienen)

| # | Sección | Contenido | Páginas estimadas | Inspirada en |
|---|---------|-----------|-------------------|--------------|
| 1 | **Carátula + Encabezado del documento** | Logo, nombre cliente, asesor, fecha, número de versión, idioma | 1 | Todas |
| 2 | **Executive Summary / Resumen Ejecutivo** | 1 página con: objetivos del cliente, asignación recomendada, probabilidad de éxito, próximos pasos | 1 | Kitces OPFP |
| 3 | **Perfil del Inversor** | Datos del cliente, situación financiera, horizonte, restricciones, tolerancia al riesgo (con frase de pérdida absoluta), preferencias ESG | 2-3 | CFA IPS Sec 1+3 |
| 4 | **Objetivos y Goals** | Lista priorizada de goals con monto, fecha objetivo, status actual | 1-2 | Morgan Stanley GPS, UBS WW |
| 5 | **Asset Allocation Recomendada** | Pie chart, tabla con bandas (target / mínimo / máximo), benchmark de cada clase | 1-2 | CFA IPS Sec 3b, JPM Exhibit A |
| 6 | **Proyecciones / Probabilidad de Éxito** | Fan chart + número de probabilidad + confidence age + escenarios bear | 2-3 | Vanguard VCMM, UBS WW |
| 7 | **Fees / Costes** | Tabla clara: fee asesor, expense ratios, custodia, total cost of ownership | 1 | Vanguard Section 5 |
| 8 | **Disclosures / Conflictos de interés** | Conflictos, productos propios, fiduciary vs idoneidad | 1 | JPM Sec XI, Vanguard |
| 9 | **Disclaimers regulatorios** | Forward-looking, hypothetical performance, past performance, jurisdiction | 1-2 | UBS WW p.45-47 |

### 5.2 Secciones opcionales (configurables por el asesor)

| # | Sección | Cuándo incluirla |
|---|---------|------------------|
| A | **Stress tests por régimen histórico** | Cliente preocupado por bear markets o quiere ver "qué pasa si..." |
| B | **Vistas condicionales (regime-aware)** | Cliente quiere ver portfolio bajo escenarios específicos (estanflación, recesión) |
| C | **Glide path** | Cliente con horizonte largo / multi-fase |
| D | **IPS detallado completo** | Cliente con patrimonio elevado, fideicomisos, o exigencias fiduciarias |
| E | **Stress test con income shocks** | Cliente con dependencia de salario o flujos irregulares |
| F | **Tax planning section** | Cliente con cuentas mixtas (taxable + tax-deferred) |
| G | **Estate / Legacy planning** | Cliente con foco multigeneracional |
| H | **Comparativo dos portafolios** | Cliente decidiendo entre alternativas (¡ya soportado por el motor de Mercantil!) |
| I | **Análisis de Synchronized Views** | Cliente con interés especial en ver co-movimientos sectoriales |
| J | **Acuerdo de seguimiento / Monitoring agreement** | Casi siempre, sección de cierre |

### 5.3 Balance estandarización ↔ personalización

La industria top-tier usa una **estructura de "boilerplate + cliente"**:
- ~70% del documento es plantilla institucional (disclaimers, metodología, framework, glosario)
- ~30% es contenido cliente-específico (sus datos, sus números, sus goals, sus charts)

Esto permite que el asesor produzca el documento en minutos durante o después de la sesión, sin sacrificar rigor.

**Patrón Vanguard / UBS**: el deliverable cliente-específico vive en las primeras páginas (executive summary + goals + allocation + proyecciones) y todo el material institucional/legal va al final como "Appendix / Important Information". Esto es clave: el cliente lee las primeras 5-10 páginas, el resto es para auditoría regulatoria.

---

## 6. Acuerdos de seguimiento / monitoring agreements

### 6.1 Cadencia de revisión (consenso industrial)

| Tipo de revisión | Frecuencia | Profundidad | Quién |
|------------------|------------|-------------|-------|
| Dashboard / Monitoring | Continuo (automático) | Drift en bandas | Sistema |
| Quarterly review | Trimestral | Performance, drift, eventos | Asesor + cliente (opcional) |
| Annual strategic review | Anual | Re-validación completa del IPS | Asesor + cliente (obligatorio) |
| Triggered review | Por evento | Re-conversación de goals | Asesor + cliente |

Vanguard, en su brochure: *"...we'll contact you, at least annually, to validate your financial planning needs and the strategy chosen for the Portfolio."*

CFA IPS recomienda: *"Ms. Wood shall review the IPS with Sam and Susan Smith no less frequently than annually."*

### 6.2 Triggers de rebalanceo (best practice)

Según [US Tech Automations](https://ustechautomations.com/resources/blog/portfolio-rebalancing-automation):
- **Tolerance bands**: rebalancear cuando una asset class se desvía >3-5% del target (o 1-2% en posiciones individuales)
- **Time-based**: trimestral o semestral como floor
- **Event-based**: cambios materiales en perfil del cliente

> Estadística citada: *"portfolios that drift 8%+ off target at the asset class level before correction experience a median annualized return drag of 15-32 basis points (...) firms using automated threshold-based rebalancing capture an average of 0.35% additional annual return compared to firms rebalancing on a fixed quarterly schedule"*

### 6.3 KPIs de monitoreo para reportar al cliente

- **Performance vs benchmark** (calculado según GIPS — Vanguard / CFA Institute standard)
- **Asset allocation drift** (actual vs target)
- **Probability of success update** (re-correr el motor con nuevos datos)
- **Goal progress** (% del goal alcanzado, on-track vs off-track)
- **Riesgo en el portafolio** (volatilidad anualizada, vs target)

### 6.4 Triggers de re-conversación / revisión de goals

Vanguard explicita: *"If your ability to bear risk, your investment time horizon, your financial situation, or your overall investment objectives change, you should notify your advisor."*

Eventos típicos que disparan revisión completa:
- Cambio laboral / pérdida de ingreso / inicio de jubilación
- Matrimonio / divorcio / nacimiento / fallecimiento familiar
- Recepción de herencia o liquidez extraordinaria
- Cambio fiscal / cambio jurisdiccional
- Evento de mercado material (drawdown >X%)

### 6.5 Texto modelo para "Acuerdo de seguimiento" (síntesis)

Sugerencia de redacción para Mercantil basada en patrones Vanguard + UBS + CFA:

> *"Acordamos revisar conjuntamente este plan al menos una vez al año para validar que sigue alineado con sus objetivos, situación y tolerancia al riesgo. Adicionalmente, [Mercantil AWM] revisará trimestralmente la asignación de su portafolio y le recomendará rebalanceos cuando alguna clase se desvíe más de [X]% del objetivo. Los siguientes eventos requieren una revisión inmediata: cambios sustanciales en sus ingresos, eventos familiares mayores, recepción de liquidez extraordinaria, o cambios fiscales materiales. Usted se compromete a notificarnos cualquiera de estos eventos. La próxima revisión periódica está programada para [fecha]."*

---

## 7. Lenguaje cliente no-técnico — guía de redacción

### 7.1 Glosarios oficiales como referencia para terminología

- **CFA Institute Glossary** — orientado a profesionales pero útil como benchmark.
- **FINRA Investor Education** [(BrokerCheck Glossary)](https://www.finra.org/investors/investing/working-with-investment-professional/about-brokercheck/glossary) — terminología accesible para inversores estadounidenses.
- **CNMV — Sus derechos como inversor** [(Guía MiFID)](https://www.cnmv.es/DocPortal/Publicaciones/Guias/G04_MiFID.pdf) — en castellano, lenguaje accesible.
- **AMF (Francia)** — guías pedagógicas para retail.
- **BaFin (Alemania)** — Verbraucherinformation.

### 7.2 Patrones de redacción que mantienen rigor sin jerga

**Patrón 1: "Definir antes de usar"**
- ❌ "El tracking error de su portafolio es 1.8%."
- ✅ "Su portafolio se aleja del benchmark en promedio 1.8% al año (lo que llamamos *tracking error*)."

**Patrón 2: "Traducir a vida cotidiana"**
- ❌ "Probabilidad de éxito: 85%."
- ✅ "En 85 de cada 100 escenarios futuros simulados, su patrimonio dura hasta los 100 años. En los 15 restantes, tendría que ajustar el gasto o aportar más."

**Patrón 3: "Mostrar el rango, no el punto"**
- ❌ "Retorno esperado anual: 6.5%."
- ✅ "En los próximos 30 años, el rango plausible de retorno anual va de 3% (escenario adverso) a 9% (escenario favorable), con 6.5% como caso central."

**Patrón 4: "Anclar a regímenes históricos"**
- ❌ "Posible drawdown máximo: 35%."
- ✅ "En un escenario tipo crisis 2008, su patrimonio podría caer alrededor de 35% antes de recuperarse en aproximadamente 2 años."

**Patrón 5: "Lenguaje de ajuste, no de fracaso"** (Kitces)
- ❌ "Su plan tiene 15% de probabilidad de fracaso."
- ✅ "En el 15% de escenarios menos favorables, tendría que ajustar el gasto en ~10% o retrasar la jubilación 2 años para mantener el plan en marcha."

### 7.3 Errores comunes a evitar

| Error | Por qué | Cómo arreglarlo |
|-------|---------|-----------------|
| "Expected return" sin volatilidad | Crea falsa precisión, ignora el riesgo | Mostrar siempre rango + probabilidad |
| "Failure / fracaso" del plan | Activa miedo, no acción | "Necesidad de ajuste" o "punto de chequeo" |
| Tablas con 6+ decimales | Falsa exactitud | Redondear a la magnitud relevante |
| Jerga técnica sin glosario | Excluye al cliente | Glosario al final, primer uso en cursiva |
| Una sola probabilidad de éxito | Engaño de precisión | Mostrar también % al 5% peor, al 95% mejor |
| Charts sin escala temporal clara | Confunde horizonte | Eje x siempre con fechas reales |
| "Past performance is not indicative..." sin contexto | Boilerplate genérico | Customizar al producto/proyección específica |
| Ocultar fees en notas al pie | Falta de transparencia | Tabla destacada en cuerpo principal |

### 7.4 Tono recomendado

UBS Wealth Way y Vanguard convergen en un tono:
- **Profesional pero cálido** — no académico, no condescendiente.
- **Primera persona plural** ("nosotros recomendamos", "trabajamos con usted") en lugar de pasiva.
- **Frases cortas** — evitar oraciones de >25 palabras.
- **Listas y bullets** sobre prosa larga para conceptos clave.
- **Charts > tablas > prosa** cuando es posible (Kitces: "una imagen vale 1.000 palabras").

### 7.5 Multiidioma — consideraciones específicas

- **Español neutro** (mercado AWM hispano transnacional). Evitar localismos. Cliente típico de Mercantil es probablemente venezolano / colombiano / panameño / estadounidense de origen latino.
- **Inglés**: usar US English (mercado primario), no UK English. Vocabulario SEC/FINRA.
- **Francés**: terminología AMF (gestion de patrimoine, allocation d'actifs, profil d'investisseur).
- **Alemán**: terminología BaFin / suiza (Vermögensverwaltung, Anlagestrategie, Risikoprofil).

Para el "Glosario / Términos clave" del PDF, mantener al menos los términos críticos en las 4 versiones traducidos consistentemente.

---

## 8. Recomendaciones de diferenciación de Mercantil Planner

Esta sección identifica lo que Mercantil PUEDE hacer en el PDF que NO hace la industria top-tier, basado en lo que ya soporta el motor.

### 8.1 Block bootstrap pareado vs Monte Carlo gaussiano

**Diferenciador #1 — el más importante.** La industria USA (Vanguard, Morgan Stanley, JPM) usa Monte Carlo paramétrico con correcciones (fat tails de Vanguard VCMM). Mercantil Planner usa **block bootstrap pareado** sobre 32 ETFs reales — preserva autocorrelación, volatility clustering, y correlaciones contemporáneas reales entre asset classes.

**Cómo comunicarlo al cliente:**
> *"A diferencia de la mayoría de simulaciones de la industria, que asumen que los rendimientos siguen una distribución estadística teórica (típicamente normal), nuestra metodología utiliza datos históricos reales mes a mes — incluyendo crisis efectivamente vividas como 2008, COVID-19 y la estanflación de los 70. Esto significa que los escenarios adversos que ve en este informe NO son inventados por el modelo: son reflejos de eventos que el mercado ya enfrentó. La metodología técnica se llama 'block bootstrap pareado' y es respaldada por la literatura académica de planificación de retiro como más realista que el Monte Carlo gaussiano clásico."*

**Apoyo bibliográfico citable**:
- Cogneau & Zakamouline (2013) — *block bootstrap produces wider left tails*.
- Pfau & Kitces (2014) — *Reducing Retirement Risk with a Rising Equity Glide Path* (referenciado en bibliografía UBS).
- [Kitces — Brier Score analysis](https://www.kitces.com/blog/monte-carlo-models-simulation-forecast-error-brier-score-retirement-planning/) — *historical and regime-based models score 25% better than traditional Monte Carlo*.
- [Quant Decoded — When Monte Carlo Fails](https://quantdecoded.com/en/when-monte-carlo-fails-retirement-planning-pitfalls).

### 8.2 Vistas condicionales con probabilidad por régimen

**Diferenciador #2.** Los 14 presets del motor permiten al cliente ver el portafolio condicionado a regímenes específicos (2008, COVID, Estanflación) — algo que la industria top-tier hace solo como stress test puntual, no como vista persistente.

**Cómo comunicarlo:**
- Sección dedicada: "¿Qué pasa si vuelve [régimen X]?"
- Tabla comparativa: portafolio actual bajo régimen normal vs régimen adverso.
- Probabilidad de éxito condicional, no marginal.

### 8.3 Synchronized views (estanflación mes a mes)

**Diferenciador #3.** Mercantil Planner soporta el modo Synchronized — el co-movimiento real mes a mes — que reproduce la estructura temporal de eventos como la estanflación 73-82, donde inflación + caídas de bonos + caídas de stocks ocurrieron simultáneamente y de forma persistente (no aleatoria). Esto es lo que el Monte Carlo clásico **NUNCA puede generar** porque asume independencia o correlaciones constantes.

**Cómo comunicarlo:**
- Mostrar al cliente un gráfico tipo "fan chart" del modo synchronized junto al modo aleatorio.
- Resaltar que el modo synchronized es un escenario "tail" útil para clientes con baja tolerancia a periodos prolongados de pérdida.

### 8.4 Reproducibilidad auditable (seed + parámetros + JSON embebido)

**Diferenciador #4.** El JSON embebido en metadata permite que cada PDF sea completamente reproducible en una sesión futura. Esto es **inédito en la industria retail** (los advisors top-tier lo hacen internamente con sus sistemas, pero no entregan el estado al cliente).

**Cómo comunicarlo:**
- Sección "Reproducibilidad" o "Auditabilidad metodológica" al final del PDF (antes de disclaimers).
- Listar: ventana histórica usada, número de escenarios, tamaño de bloque, seed aleatorio, fecha de los datos, versión del motor.
- Texto: *"Este informe es 100% reproducible. Ante cualquier pregunta sobre los números, podemos retomar exactamente la misma simulación en cualquier momento. El estado completo de su sesión está embebido en este documento como metadata técnica."*

**Best practice industrial citable**: [Lawrence Emenike — Audit Trails for Compliance](https://lawrence-emenike.medium.com/audit-trails-and-explainability-for-compliance-building-the-transparency-layer-financial-services-d24961bad987) — *"automated systems can record and generate AI evidence (such as model metadata, code changes, and data lineage) and guarantee reproducibility necessary for audits"*.

Es un bullet poderoso para los disclaimers regulatorios bajo SEC Marketing Rule (que exige *"information sufficient to enable the intended audience to understand the criteria used and assumptions made"*).

### 8.5 Comparativo dos portafolios en paralelo

**Diferenciador #5.** El motor soporta correr 2 portafolios en paralelo. La industria suele entregar un único "recomendado" y a veces un benchmark. Entregar 2 candidatos con todas las métricas comparadas es:
- Más educativo para el cliente.
- Refuerza la noción de que NO hay un único óptimo.
- Permite el storytelling tipo "portafolio actual vs portafolio recomendado" o "agresivo vs balanceado".

**Cómo comunicarlo:**
- Side-by-side tables y charts.
- Subrayar trade-offs: el portafolio A tiene mayor probabilidad de éxito pero mayor drawdown; el B al revés.

### 8.6 Resumen de la propuesta de valor diferencial (3 líneas)

> **Mercantil Planner entrega tres cosas que la industria top-tier no entrega al cliente final:**
> 1. **Realismo estadístico verificable**: el rigor del block bootstrap pareado, presentado de forma accesible, alineado con la última literatura académica.
> 2. **Regímenes históricos como vistas, no anécdotas**: el cliente puede ver su plan bajo 14 escenarios de mercado reales, no solo un "stress test" puntual.
> 3. **Reproducibilidad cliente-side**: el PDF es la sesión. Cualquier futura conversación retoma el estado exacto, sin pérdidas de información.

---

## 9. Recomendación de estructura para el PDF de Mercantil Planner

Síntesis ejecutiva del benchmark + el diferencial. El siguiente esqueleto integra:
- Estándar CFA / CFP Board (rigor IPS)
- Patrones top-tier (Vanguard, UBS, JPM)
- Best practices de visualización Monte Carlo (Kitces, eMoney)
- Diferenciadores Mercantil (block bootstrap, regímenes, reproducibilidad)
- Cumplimiento bilingüe / regulación múltiple

### 9.1 Esqueleto del PDF — propuesta concreta

```
┌─ SECCIÓN A: PORTADA + ENTRADA  (1-2 pp)
│  A1. Carátula. Logo Mercantil AWM. Nombre cliente. Asesor.
│      Fecha. Versión. Idioma. ID único de sesión.
│  A2. (Opcional) Carta del asesor — 1 párrafo personalizado.
│
├─ SECCIÓN B: RESUMEN EJECUTIVO  (1 pp)  ★ la más importante para el cliente
│  B1. Objetivo principal en 1 frase.
│  B2. Asignación recomendada (mini pie chart).
│  B3. Probabilidad de éxito (1 número grande + confidence age).
│  B4. 3 acciones concretas inmediatas.
│  B5. Próxima revisión: fecha.
│
├─ SECCIÓN C: PERFIL DEL INVERSOR Y OBJETIVOS  (2-3 pp)
│  C1. Perfil personal (edad, situación familiar, horizonte).
│  C2. Situación financiera (patrimonio actual, ingresos, gastos).
│  C3. Tolerancia al riesgo expresada como límite absoluto de pérdida.
│  C4. Lista priorizada de goals con monto, fecha, status.
│  C5. Restricciones (liquidez, fiscales, ESG, exclusiones).
│
├─ SECCIÓN D: PORTAFOLIO RECOMENDADO  (2-3 pp)
│  D1. Asset allocation pie chart (con bandas mínimo/máximo).
│  D2. Tabla por clase con benchmark.
│  D3. Lista de los 32 ETFs con peso y rationale.
│  D4. (Si aplica) Comparativo dos portafolios paralelo.  ★ diferencial
│
├─ SECCIÓN E: PROYECCIONES  (3-4 pp)  ★ corazón del documento
│  E1. Fan chart del balance proyectado a 30 años.
│  E2. Probabilidad de éxito + confidence age + percentiles 5/25/50/75/95.
│  E3. Cómo leer este gráfico (1 párrafo educativo).
│  E4. Drawdowns esperados y tiempo de recuperación.
│  E5. Lenguaje de ajuste (Kitces): qué hacer si ocurre el percentil 15.
│
├─ SECCIÓN F: STRESS TESTS POR RÉGIMEN HISTÓRICO  (2-3 pp)  ★ diferencial
│  F1. Tabla de regímenes: 2008, COVID, Estanflación 73-82, Dot-com 2000-02.
│  F2. Para cada régimen: drawdown, tiempo bajo agua, recuperación.
│  F3. (Opcional) Synchronized view de estanflación.
│  F4. Implicación: "su plan resistiría X de estos regímenes sin ajuste".
│
├─ SECCIÓN G: VISTAS CONDICIONALES Y SENSIBILIDADES  (1-2 pp)
│  G1. Cómo cambia la probabilidad de éxito si:
│       - aumenta inflación 2pp
│       - retrasa jubilación 2 años
│       - reduce gasto 10%
│       - aporta 20% adicional ahora
│  G2. Tabla de sensibilidad simple, accionable.
│
├─ SECCIÓN H: COSTES  (1 pp)
│  H1. Fee de asesoría Mercantil.
│  H2. Expense ratios subyacentes (promedio ponderado de los 32 ETFs).
│  H3. Custodia y otros.
│  H4. Total cost of ownership anual + impacto a 10/20/30 años.
│
├─ SECCIÓN I: ACUERDO DE SEGUIMIENTO  (1 pp)
│  I1. Cadencia de revisión (anual + triggers).
│  I2. Política de rebalanceo (bandas de tolerancia).
│  I3. KPIs que se reportarán.
│  I4. Eventos que disparan re-conversación inmediata.
│  I5. Próxima revisión: fecha.
│
├─ SECCIÓN J: GLOSARIO  (1-2 pp)
│  J1. Términos clave en lenguaje cliente.
│       (block bootstrap, fan chart, drawdown, probabilidad de éxito,
│        rebalanceo, asset allocation, etc.)
│  J2. Multiidioma: 4 columnas (ES / EN / FR / DE).
│
├─ SECCIÓN K: METODOLOGÍA Y REPRODUCIBILIDAD  (1-2 pp)  ★ diferencial
│  K1. Bloque conceptual: por qué block bootstrap pareado.
│  K2. Comparación block bootstrap vs Monte Carlo gaussiano (tabla
│      simple del beneficio).
│  K3. Parámetros técnicos: ventana histórica, número de escenarios,
│      tamaño de bloque, seed, fecha de datos, versión del motor.
│  K4. "Este informe es 100% reproducible. El estado completo de su
│      sesión está incrustado en este documento como metadata."
│
└─ SECCIÓN L: DISCLAIMERS Y AVISOS LEGALES  (2-3 pp)
   L1. Forward-looking statements (customizado a la simulación).
   L2. Hypothetical performance (alineado con SEC Marketing Rule).
   L3. Past performance is no guarantee.
   L4. Conflictos de interés y disclosures.
   L5. Jurisdicción aplicable (multi-país).
   L6. Firma del cliente y del asesor (acknowledge receipt).

[METADATA EMBEBIDA]
- JSON con estado completo: perfil, allocation, parámetros del motor,
  seed, escenarios usados, todas las cifras del documento.
- Standard XMP para metadata custom.
- Permite retomar la próxima sesión exactamente desde aquí.
```

### 9.2 Comentarios sobre el esqueleto

- **Total estimado**: 18-25 páginas para versión completa, 6-8 páginas para versión "executive only".
- **Páginas 1-4 (A+B+C inicio)**: lo que el cliente realmente lee.
- **Páginas 5-15 (D+E+F+G+H)**: el cuerpo técnico-narrativo.
- **Páginas 16-25 (I+J+K+L)**: cierre operativo y compliance.
- **Modularidad**: cada sección F/G/K es opcional según el cliente. El asesor configura un "preset" por sesión.

### 9.3 Estilo visual recomendado

Basado en convergencia UBS Wealth Way + Vanguard:
- **Tipografía**: serif clásica para encabezados (transmite institucionalidad), sans-serif para cuerpo (legibilidad). Sugerencia: par tipográfica tipo Goldman Sachs (GS Serif + GS Sans).
- **Paleta**: 2-3 colores corporativos Mercantil + neutros. Evitar más de 5 colores.
- **Charts**: minimalismo Edward Tufte. Líneas finas. Etiquetas directas, no leyendas separadas. Áreas sombreadas con transparencia para fan charts.
- **Espacios en blanco**: generosos. UBS Wealth Way usa ~40% de cada página como white space.
- **Iconografía**: opcional, una sola familia visual. Evitar emojis o cliparts.

### 9.4 Multiidioma — implementación recomendada

- Una versión por idioma (no documento bilingüe en el mismo PDF — confunde).
- Los términos clave siempre con traducción en el glosario final.
- Los nombres de regímenes históricos: en local + año (ej. "Crisis Financiera Global 2008", "Global Financial Crisis 2008", "Crise financière mondiale 2008", "Globale Finanzkrise 2008").
- El JSON embebido es language-agnostic; un campo `"locale": "es-VE"` permite re-renderizar el PDF en cualquier idioma desde el mismo estado.

### 9.5 Texto de marketing para la portada (4 idiomas, propuesta)

| Idioma | Subtítulo propuesto |
|--------|---------------------|
| ES | *Plan personal de inversión — análisis basado en escenarios históricos reales* |
| EN | *Personal Investment Plan — Analysis Based on Real Historical Scenarios* |
| FR | *Plan d'investissement personnel — analyse fondée sur des scénarios historiques réels* |
| DE | *Persönlicher Anlageplan — Analyse auf Basis realer historischer Szenarien* |

### 9.6 Disclaimer modelo customizado (propuesta de redacción ES)

Versión inicial sugerida combinando los patrones SEC + UBS + CFA:

> *"Las proyecciones contenidas en este documento se han generado mediante simulación con el motor propietario de Mercantil Planner, basado en metodología de block bootstrap pareado sobre datos históricos mensuales de 32 ETFs entre [FECHA INICIO] y [FECHA FIN]. Los resultados son hipotéticos, no reflejan rendimientos efectivos de inversión y no constituyen garantía de resultados futuros. Las simulaciones varían en cada ejecución. La metodología busca representar incertidumbre real preservando estructuras de autocorrelación y co-movimiento entre activos observadas históricamente. Sin embargo, el modelo puede subestimar escenarios extremos no observados en el período histórico utilizado. Este documento se entrega únicamente con fines informativos y para la discusión con su asesor de Mercantil AWM. No constituye una oferta ni recomendación de inversión por sí mismo, ni reemplaza el contrato de asesoramiento o gestión patrimonial vigente. Rentabilidades pasadas no garantizan rentabilidades futuras. Los costes y la fiscalidad pueden afectar materialmente los resultados reales."*

### 9.7 Checklist final para el equipo de producto

Antes de cerrar el diseño, verificar:

- [ ] Resumen ejecutivo cabe en 1 página
- [ ] Probabilidad de éxito presentada con definición operativa clara ($X al final del horizonte en Y% de escenarios)
- [ ] Confidence age incluido como traducción intuitiva
- [ ] Fan chart o probability cone en proyecciones (no solo número único)
- [ ] Al menos un régimen histórico mostrado (2008 o COVID)
- [ ] Comparativo dos portafolios soportado (cuando el asesor lo active)
- [ ] Tabla de fees + total cost of ownership a 10/20/30 años
- [ ] Glosario multiidioma (4 idiomas en términos críticos)
- [ ] Sección de reproducibilidad con seed visible
- [ ] JSON embebido en metadata XMP custom
- [ ] Disclaimers customizados a la simulación específica (no boilerplate)
- [ ] Forward-looking customizado (alineado con SEC Marketing Rule)
- [ ] Acuerdo de seguimiento con cadencia y triggers concretos
- [ ] Firma del cliente + asesor al final
- [ ] Versión y ID único de sesión visible en cada página

---

## 10. Adenda 2026-05-05 — feedback Pocho integrado

Tras la lectura del dossier por Pocho (Head of Quant Research, Mercantil AWM), se incorporan tres puntos que enriquecen el diseño del PDF de cierre y, en dos casos, exigen extensiones del motor del planner. Esta adenda actualiza secciones del dossier para que la propuesta de PDF refleje el alcance completo discutido.

### 10.1 Métricas de cola — CVaR / Expected Shortfall + meses negativos esperados

**Diagnóstico de Pocho:** lo más útil del modelo de Mercantil son las colas. Pero hablar de los percentiles 5 al 95 sigue siendo hablar de **condiciones normales de mercado**. Para describir las colas hay que ir **más allá** de ese rango: reportar el **promedio condicional** de los valores fuera de esos percentiles, y hacerlo a distintos horizontes.

**Tríada propuesta para sección E del PDF (Proyecciones):**

1. **Percentiles centrales P5/P25/P50/P75/P95** — fan chart estándar. Habla de condiciones normales.
2. **CVaR (Conditional Value at Risk) / Expected Shortfall, por horizonte:**
   - `CVaR_5(h)`: media condicional de los valores **debajo del percentil 5** al horizonte `h`.
   - `CVaR_95(h)`: media condicional de los valores **arriba del percentil 95** al horizonte `h` (útil para upside esperado en escenarios excepcionales).
   - Horizontes recomendados: 5, 10 y 20 años.
   - Por qué importa: el percentil 5 dice **dónde empieza** la cola; el CVaR dice **qué tan profunda es** en promedio. La industria muestra VaR (el percentil) pero raramente Expected Shortfall al cliente final, aunque Basel III lo exige a bancos. Para wealth retail es un diferenciador real.
3. **Meses negativos esperados al año** — métrica que **ya existe en el motor** del planner (`metrics.ts:71` — `meses negativos anualizados`: `(#meses con r<0 en ventana) · 12 / len`). Pocho identificó este número como uno de los **dolores cliente más claros** en sus charlas, incluso con clientes que no son benchmark. Comunicación intuitiva: "*cuántos meses al año va a ver pérdidas en su cuenta*" — número que la industria oculta o no calcula explícitamente.

**Implicación al motor del planner:**

- Extender `WindowMetrics` con `cvar5: number | Float32Array` y `cvar95: number | Float32Array` (escalar global o curva mes a mes según uso).
- Extender `computeFanChartBands` con `p5` y `p95` (hoy hay P10/P25/P50/P75/P90).
- Tests de invariantes: `CVaR_5 ≤ P5`, `CVaR_95 ≥ P95`, monotonía con horizonte, etc.

**Implicación al PDF (sección E):**

> "Su plan tiene una probabilidad del 90% de terminar entre $X y $Y a 20 años. En el 5% de escenarios menos favorables, el resultado promedio es $Z (≈ −W% sobre el escenario central). En esos escenarios desfavorables, su cuenta tendría en promedio M meses negativos al año (vs N en el escenario típico)."

Esto preserva el lenguaje "puntos de ajuste" propuesto por Kitces (sección 4.5) y ancla las decisiones del cliente al **comportamiento esperado en colas**, no solo al centro.

**Diferenciador adicional vs industria top-tier:** Vanguard PAS reporta probability of success, no Expected Shortfall. UBS Wealth Way muestra historical bear markets, no CVaR forward-looking. JPM Private Bank muestra VaR a clientes institucionales, raramente a clientes retail. **Mercantil entrega la tríada al cliente final.**

### 10.2 Modelo de renta fija propio — diferenciador #6

**Aclaración importante:** el **modelo de renta fija de Mercantil AWM** (autoría de Pocho desde antes de su llegada a Mercantil) **no se maneja como propiedad intelectual cerrada**, pero sí debe presentarse como rigurosidad diferenciada del enfoque cuantitativo del banco.

**Descripción del modelo (lenguaje técnico para el dossier):**

La industria estándar bootstrappea **retornos históricos de ETFs de renta fija** como insumo de simulación. Eso tiene un sesgo estructural: los retornos pasados se generaron bajo un nivel de tasas distinto al actual, y por lo tanto incorporan:

- **Carry de aquella época** (ej. cupones del 4-5% pre-2008, del 1-2% post-QE), no el carry vigente.
- **Sensibilidad a cambios de tasas calibrada al precio de aquella época** (la duración modificada depende del nivel de tasas; un bono al 1% tiene duración modificada distinta a un bono al 5% al mismo plazo).
- **Distorsiones de revalorización del régimen pasado** (ej. el ciclo 2009-2021 de tasas comprimiéndose generó retornos artificialmente altos por *price appreciation* en ETFs largos como TLT — repetir ese retorno hoy requeriría que las tasas vuelvan a comprimirse desde el nivel actual, lo que no es repetible al mismo grado).

**Approach del modelo Mercantil:**

En lugar de bootstrappear precios/retornos históricos del ETF, el modelo:

1. Toma la **respuesta histórica de las tasas a eventos de mercado** (cómo se movieron yields del 2y, 5y, 10y, 30y, etc., en 2008, 2020, estanflación, etc.).
2. **Re-proyecta esos movimientos al nivel actual de tasas** — el shock se aplica sobre el yield vigente, no sobre el yield histórico.
3. **Calcula el retorno del bono** usando el yield actual (carry corriente) y la sensibilidad correcta vía **duración modificada del régimen vigente** (y convexidad cuando aplica, en bonos largos).
4. **Preserva las correlaciones entre puntos de la curva** (la respuesta del 2y vs el 10y vs el 30y ante un shock no es uniforme — el modelo respeta esa estructura).

**Lo que esto resuelve sobre el approach naive:**

- Si las tasas hoy están más altas que el promedio histórico, el carry esperado es mayor, pero la sensibilidad a un repunte adicional también lo es. El approach naive subestima ambos efectos en direcciones que pueden cancelarse parcialmente, dejando ruido sin estructura.
- Si las tasas hoy están más bajas, el carry esperado es menor pero la duración modificada es mayor — riesgo asimétrico que el approach naive aplana.
- En transiciones de régimen (post-QE, post-QT, normalizaciones), el approach naive entrega prácticamente ruido; el approach de Mercantil mantiene calibración.

**Cómo conecta con el resto del rigor del planner:**

- El **block bootstrap pareado** preserva correlaciones cross-asset (renta variable, RF, RV emergente, etc.) — pero alimenta cada bloque con retornos generados por el modelo apropiado a cada clase de activo.
- Para renta fija, esos retornos vienen del modelo de tasas actuales descrito arriba (no de retornos históricos del ETF directamente).
- Para renta variable, sí se usa el bootstrap directo de retornos históricos (la distinción entre carry/duración/convexidad no aplica con la misma fuerza).
- Los **AMCs** que combinan RF (`GlFI`, `RF.Lat`, `ST.Cr.Opps`, `HY.Cr.Opps`, `CashST`, `USTDur`, `CDT-Proxy`) heredan esta calibración correcta.

**Diferenciador #6 sobre la industria top-tier (a sumar a los 5 ya identificados en sección 8 del dossier):**

> *Modelo de renta fija calibrado al régimen de tasas vigente. La mayoría de simuladores top-tier (Vanguard VCMM, Schwab CMA, Morgan Stanley GIC) bootstrappea retornos históricos de ETFs de renta fija — heredando carry y sensibilidad de regímenes pasados. El modelo de Mercantil descompone la respuesta histórica de las tasas y la re-proyecta sobre el nivel actual, preservando carry corriente, duración modificada y correlaciones de la curva.*

**Implicación al PDF — sección K (Metodología), bloque dedicado en lenguaje cliente:**

> "Para la renta fija, no usamos los retornos pasados de los ETFs como hace gran parte de la industria. Esos retornos pasados se generaron con tasas distintas a las de hoy y arrastran ganancias o pérdidas que no se van a repetir. En su lugar, miramos cómo se movieron las tasas en eventos históricos (2008, COVID, etc.) y aplicamos esos movimientos al nivel actual de tasas. Esto preserva el rendimiento corriente de su portafolio, su sensibilidad real a cambios de tasas, y cómo se mueven juntos los distintos plazos de la curva. Es uno de los aportes propios del equipo cuantitativo de Mercantil AWM al rigor de las simulaciones."

### 10.3 Inflación nominal / real — al backlog (no MVP)

**Posición de Pocho:** la inflación es un factor que históricamente Mercantil ha descartado en simulación, pero debería **incluirse como factor adicional**: cada simulación debería correr siempre con inflación, para entregar resultados en términos **nominales y reales** lado a lado.

**Estado actual del motor:** `PlanMode: 'nominal' | 'real'` con `inflationPct: 2.5` default — corre uno **o** el otro, no ambos en paralelo.

**Cambio requerido:** correr ambos en paralelo, o post-procesar el output para entregar las dos proyecciones desde una única simulación.

**Dificultad técnica reconocida:** modelar inflación histórica condicionada al **régimen de tasas actual** no es trivial. Pocho propone como aproximación inicial: usar el **diferencial histórico de curvas** (tasa fija nominal vs inflación implícita / break-even) **vs el spread vigente hoy** como proxy de cómo cambia la expectativa de inflación. Pocho explícitamente reconoce que esto **no es un buen predictor** y está abierto a mejorar el modelo.

**Decisión:** **AL BACKLOG, no alcance inmediato.** Razones:

- Feature 1 (Auth con Cloudflare) y Feature 2 (PDF de cierre con state container) son prioridad para cerrar MVP que se entrega a colegas asesores.
- Trabajar inflación ahora desviaría del objetivo de las próximas 1-2 sesiones (cableado UI del PDF + 12 secciones).
- Cuando MVP cierre, abrir **Fase E**: inflación dual nominal/real con modelo condicionado al régimen actual.

**Pendiente al abrir Fase E:**

- Investigar literatura sobre modelos de inflación condicionada (Diebold-Li para curva nominal, modelos joint nominal/real, break-even forwards, etc.).
- Decidir entre (a) modelar inflación como serie generadora con su propio bootstrap, (b) tomar break-even del TIPS market como proxy forward-looking, (c) modelo conjunto nominal+real con tasas reales de TIPS.
- Implementación en motor: duplicar paths o post-procesar.
- Implementación en PDF: dos columnas en sección E — nominal y real.

---

## Apéndice — fuentes principales consultadas

### Documentos primarios (PDFs públicos extraídos)

1. CFA Institute (2010). *Elements of an Investment Policy Statement for Individual Investors.* ISBN 978-0-938367-31-4. [PDF](https://rpc.cfainstitute.org/sites/default/files/-/media/documents/article/position-paper/investment-policy-statement-individual-investors.pdf)

2. JPMorgan / Simpson Thacher (2021). *Investment Policy Template.* Distribuido por NCFP. [PDF](https://www.ncfp.org/wp-content/uploads/2021/08/Investment-Policy-Statement-Template-JP-Morgan-2021.pdf)

3. Vanguard National Trust Company (marzo 2026). *Vanguard Personal Advisor Wealth Management Brochure.* [PDF](https://personal1.vanguard.com/pdf/vntcbroc.pdf)

4. Vanguard Advisers Inc. *Vanguard Personal Advisor Select Brochure.* [PDF](https://personal1.vanguard.com/pdf/vpabroc.pdf)

5. UBS Chief Investment Office (octubre 2024). *UBS Wealth Way: A purpose-based approach to managing your wealth.* Whitepaper bandera, 47 páginas. [PDF](https://www.ubs.com/us/en/wealth-management/our-approach/ubs-wealth-way)

6. Andrew Marshall Financial. *Sample Family Financial Plan.* [Sitio](https://andrewmarshallfinancial.com/sample-financial-plan/)

7. Visual Capitalist / UBS (febrero 2025). *UBS House View Investment Strategy Guide.* [PDF](https://elements.visualcapitalist.com/wp-content/uploads/2025/02/1738217853733.pdf)

### Documentos regulatorios

8. SEC. *17 CFR § 275.206(4)-1 — Investment adviser marketing.* [Cornell Law](https://www.law.cornell.edu/cfr/text/17/275.206(4)-1)

9. ESMA (2023). *Guidelines on certain aspects of the MiFID II suitability requirements.* [PDF](https://www.esma.europa.eu/sites/default/files/2023-04/ESMA35-43-3172_Guidelines_on_certain_aspects_of_the_MiFID_II_suitability_requirements.pdf)

10. CNMV. *Sus derechos como inversor — Guía MiFID.* [PDF](https://www.cnmv.es/DocPortal/Publicaciones/Guias/G04_MiFID.pdf)

11. CNMV. *Guía sobre la prestación del servicio de asesoramiento.* [PDF](https://www.cnmv.es/DocPortal/GUIAS_Perfil/GuiaAsesoramientoInversion.pdf)

12. EU Commission. *Key Information Documents for PRIIPs.* [Sitio](https://finance.ec.europa.eu/consumer-finance-and-payments/retail-financial-services/key-information-documents-packaged-retail-and-insurance-based-investment-products-priips_en)

### Análisis y crítica académica de Monte Carlo

13. Quant Decoded. *When Monte Carlo Fails: The Hidden Pitfalls of Retirement Simulations.* [Artículo](https://quantdecoded.com/en/when-monte-carlo-fails-retirement-planning-pitfalls)

14. Portfolio Optimizer. *Bootstrap Simulation with Portfolio Optimizer: Usage for Financial Planning.* [Artículo](https://portfoliooptimizer.io/blog/bootstrap-simulation-with-portfolio-optimizer-usage-for-financial-planning/)

15. Kitces. *Assessing Performance Predictiveness Of Monte Carlo Models.* (Brier Score analysis, vía búsqueda web).

16. Kitces. *Calming Client Fears: Communicating Monte Carlo Outcomes.* (vía búsqueda web).

17. Cogneau & Zakamouline (2013). Análisis citado en quantdecoded.com sobre block bootstrap vs Monte Carlo.

18. Pfau, W. D., & Kitces, M. E. (2014). *Reducing Retirement Risk with a Rising Equity Glide Path.* Journal of Financial Planning, 27(1), 38-45.

### Visualización y comunicación

19. eMoney Advisor. *Securing Client Confidence with Monte Carlo Simulation in Financial Planning.* [Artículo](https://emoneyadvisor.com/blog/securing-client-confidence-with-monte-carlo-simulation-in-financial-planning/)

20. DataViz Catalogue Blog. *Chart Snapshot: Fan Charts.* [Artículo](https://datavizcatalogue.com/blog/chart-snapshot-fan-chart/)

21. Kitces. *The One-Page Financial Plan: Focusing On What Matters Most.* [Artículo](https://www.kitces.com/blog/one-page-financial-plan-deliverable-opfp-jeremy-walter-carl-richards/)

### Referencia industrial complementaria

22. Morgan Stanley. *Goals Planning System (GPS) Sample Report.* [PDF](https://advisor.morganstanley.com/the-cornerstone-group-milwaukee/documents/field/c/co/cornerstone-group-milwaukee/GPS_Sample_Report.pdf)

23. Schwab. *Wealth Advisory Sample Scenarios.* [Sitio](https://www.schwab.com/wealth-management/wealth-advisor/sample-scenarios)

24. Northern Trust. *Form CRS.* [PDF](https://www.northerntrust.com/content/dam/northerntrust/pws/nt/documents/wealth-management/form-crs.pdf)

25. Lawrence Emenike. *Audit Trails and Explainability for Compliance.* (Reproducibilidad / auditabilidad). [Medium](https://lawrence-emenike.medium.com/audit-trails-and-explainability-for-compliance-building-the-transparency-layer-financial-services-d24961bad987)

---

**Fin del dossier.** ~10.000 palabras. Listo para informar el diseño del PDF Mercantil Planner.
