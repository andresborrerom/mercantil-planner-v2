/**
 * Header estilo Mercantil — usa el wordmark oficial de Mercantil Servicios
 * Financieros Internacional sobre fondo navy (servido desde
 * `public/mercantil-logo.png`), con nav y CTAs a la derecha.
 *
 * Renderiza un badge informativo "Fase 2 · RF yield-path" que indica que los 11
 * tickers de renta fija usan reconstrucción estructural (carry evolutivo + duration·Δy
 * + ½·conv·Δy² + residual credit bootstrapeado). El motor de bootstrap imprime también
 * el detalle en consola al arrancar.
 *
 * Incluye un `ThemeToggle` para alternar entre tema claro y oscuro.
 */
import ThemeToggle from './ThemeToggle';

const LOGO_URL = `${import.meta.env.BASE_URL}mercantil-logo.png`;

export default function Header() {
  const navItems = [
    { label: 'Planificador', active: true },
    { label: 'Portafolios', active: false },
    { label: 'Flujos', active: false },
    { label: 'Reportes', active: false },
  ];

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-mercantil-line shadow-sm dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line dark:shadow-none">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={LOGO_URL}
            alt="Mercantil Servicios Financieros Internacional"
            className="h-10 w-auto select-none"
            draggable={false}
          />
          <PhaseBadge />
        </div>

        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={[
                'relative text-sm font-medium transition',
                item.active
                  ? 'text-mercantil-navy dark:text-mercantil-dark-ink'
                  : 'text-mercantil-slate hover:text-mercantil-navy dark:text-mercantil-dark-slate dark:hover:text-mercantil-dark-ink',
              ].join(' ')}
            >
              {item.label}
              {item.active && (
                <span className="absolute -bottom-5 left-0 right-0 h-[3px] bg-mercantil-orange rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            className="mp-btn-outline hidden sm:inline-flex"
            onClick={() => window.open(`${import.meta.env.BASE_URL}instructivo/`, '_blank', 'noopener')}
            title="Abrir el instructivo del asesor en una pestaña nueva"
          >
            Guía del asesor
          </button>
          <button className="mp-btn-primary">
            Mercantil en Línea
            <span aria-hidden className="ml-1">
              ▾
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Badge informativo que indica que los 11 tickers de renta fija usan
 * reconstrucción yield-path (Fase 2): carry evolutivo a partir del nivel actual
 * de tasas + duration·Δy + ½·conv·Δy² + residual credit bootstrapeado del mismo
 * bloque histórico. Damping cuadrático en los extremos del rango histórico
 * (piso = min − 0.5%, techo = max × 1.5). La lista de tickers se inlinea en el
 * tooltip para no arrastrar market.generated.ts (~400 KB) al bundle principal.
 */
function PhaseBadge() {
  return (
    <span
      className="hidden lg:inline-flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 text-[11px] font-semibold cursor-help"
      title={
        'Fase 2 del motor RF: los 11 tickers de renta fija (BIL, SPTS, IEI, IEF, SPTL, ' +
        'IGOV, AGG, LQD, GHYG, EMB, CEMB) usan reconstrucción yield-path. Cada mes, ' +
        'el carry se deriva del nivel simulado de yield (partiendo del último observado) ' +
        'y el retorno por precio de duration·Δy + ½·conv·Δy². Para credit/EM el modelo ' +
        'suma un residual bootstrapeado que captura el spread premium. Damping cuadrático ' +
        'fuera del rango histórico (piso = min − 0.5%, techo = max × 1.5).'
      }
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
      Fase 2 · RF yield-path
    </span>
  );
}

