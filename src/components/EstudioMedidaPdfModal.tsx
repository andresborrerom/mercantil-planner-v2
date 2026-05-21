/**
 * Modal para generar el PDF "Estudio a la Medida".
 *
 * Inputs visibles por default: clientName, clientType, advisorName, version,
 * locale, advisorNote. Acordeón "Más detalles ▶" expande subtype/age/governance,
 * bucket Wealth Way override y módulos opcionales (stress, sensitivities,
 * methodology, sleevesDetail).
 *
 * Defaults sensatos derivan automáticamente:
 *   - bucket Wealth Way ← horizonte + flujos
 *   - governance ← clientSubtype (Comité de Inversiones / Consejo / etc.)
 *
 * Si el usuario no expande "Más detalles", igual genera un PDF razonable.
 */
import { useEffect, useState } from 'react';

import { useCaseStudyStore } from '../state/caseStudyStore';
import {
  buildEstudioMedidaStateContainer,
  clientSlug,
  deriveBucket,
  pdfFileName,
  type EstudioMedidaFormInputs,
} from '../pdf/estudio-medida/state/serialize';
import type {
  ClientType,
  JuridicaSubtype,
  PdfLocale,
  StudyVersion,
  WealthBucket,
} from '../pdf/estudio-medida/state/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

const CLIENT_TYPES: { value: ClientType; label: string; helper: string }[] = [
  {
    value: 'juridica',
    label: 'Persona Jurídica',
    helper: 'Endowment, fundación, colegio, empresa — incluye IPS formal con gobernanza.',
  },
  {
    value: 'natural',
    label: 'Persona Natural',
    helper: 'Cliente individual — incluye directrices personales con anclaje psicológico.',
  },
];

const JURIDICA_SUBTYPES: { value: JuridicaSubtype; label: string }[] = [
  { value: 'endowment', label: 'Endowment / Fondo perpetuo' },
  { value: 'fundacion', label: 'Fundación' },
  { value: 'colegio', label: 'Institución educativa' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'familia', label: 'Family Office' },
  { value: 'otro', label: 'Otra estructura' },
];

const BUCKETS: { value: WealthBucket; label: string; helper: string }[] = [
  { value: 'liquidity', label: 'Liquidez', helper: '0–5 años' },
  { value: 'longevity', label: 'Longevidad', helper: 'Largo plazo' },
  { value: 'legacy', label: 'Legado', helper: 'Multi-generacional' },
];

const VERSIONS: { value: StudyVersion; label: string; helper: string }[] = [
  { value: 'completa', label: 'Completa', helper: '~15–22 pp · IPS / directrices + estrategia + resultados + apéndice legal' },
  { value: 'ejecutiva', label: 'Ejecutiva', helper: '~6–8 pp · resumen para entrega al cliente' },
];

const LOCALES: { value: PdfLocale; label: string; draft?: boolean }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français', draft: true },
  { value: 'de', label: 'Deutsch', draft: true },
];

const DEFAULT_GOVERNANCE_BY_SUBTYPE: Record<JuridicaSubtype, string> = {
  endowment: 'Comité de Inversiones',
  fundacion: 'Consejo Directivo',
  colegio: 'Junta Directiva',
  empresa: 'Comité de Tesorería',
  familia: 'Family Office Committee',
  otro: 'Órgano competente',
};

export default function EstudioMedidaPdfModal({ open, onClose }: Props) {
  const config = useCaseStudyStore((s) => s.config);
  const result = useCaseStudyStore((s) => s.result);
  const savedVariants = useCaseStudyStore((s) => s.savedVariants);

  const [form, setForm] = useState<EstudioMedidaFormInputs>(() => ({
    clientName: '',
    clientType: 'juridica',
    bucket: deriveBucket(config),
    advisorName: '',
    version: 'completa',
    locale: 'es',
    modules: { stressTests: false, sensitivities: false, methodology: true, sleevesDetail: false },
  }));
  const [advisorNote, setAdvisorNote] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuando cambia el tipo de cliente, autorrellenar governance default si no hay nada cargado.
  useEffect(() => {
    if (form.clientType === 'juridica' && form.clientSubtype && !form.clientGovernance) {
      setForm((f) => ({
        ...f,
        clientGovernance: DEFAULT_GOVERNANCE_BY_SUBTYPE[form.clientSubtype!],
      }));
    }
  }, [form.clientType, form.clientSubtype, form.clientGovernance]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const viewerWindow = window.open('', '_blank');
    try {
      const formWithNote: EstudioMedidaFormInputs = {
        ...form,
        advisorNote: advisorNote.trim() || undefined,
      };
      const state = buildEstudioMedidaStateContainer({
        form: formWithNote,
        config,
        result,
        savedVariants,
      });
      const filename = pdfFileName(
        clientSlug(state.client.name),
        state.client.type,
        state.version,
      );
      // Dynamic import — mantiene el bundle inicial chico (react-pdf + pdf-lib son pesados).
      const { generateAndDownloadEstudioMedidaPdf } = await import('../pdf/estudio-medida/download');
      await generateAndDownloadEstudioMedidaPdf(state, { filename, viewerWindow });
      onClose();
    } catch (err) {
      if (viewerWindow && !viewerWindow.closed) viewerWindow.close();
      console.error('[EstudioMedidaPdfModal] generación falló', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const isJuridica = form.clientType === 'juridica';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-mercantil-dark-panel rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border border-mercantil-line dark:border-mercantil-dark-line"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-mercantil-ink dark:text-mercantil-dark-ink">
              Generar Estudio a la Medida
            </h2>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-1">
              Entregable personalizado por cliente — incluye IPS / directrices, estrategia, resultados y apéndice legal.
              El estado completo del estudio queda embebido en el PDF para retomar el seguimiento.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xl leading-none text-mercantil-slate hover:text-mercantil-ink dark:hover:text-mercantil-dark-ink disabled:opacity-50"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {!result && (
          <div className="mt-4 p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200">
            ⚠ No has corrido la simulación todavía. El PDF se genera igual, pero la sección de resultados queda vacía.
            Cerrá este modal, corré la simulación, y volvé a abrirlo para obtener el entregable completo.
          </div>
        )}

        {/* Identidad del cliente */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
              Cliente
            </span>
            <input
              required
              type="text"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              placeholder="Nombre completo o razón social"
              className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
              Asesor
            </span>
            <input
              required
              type="text"
              value={form.advisorName}
              onChange={(e) => setForm({ ...form, advisorName: e.target.value })}
              placeholder="Nombre del asesor"
              className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
            />
          </label>
        </div>

        {/* Tipo de cliente */}
        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Tipo de cliente
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CLIENT_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setForm({ ...form, clientType: t.value })}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  form.clientType === t.value
                    ? 'border-mercantil-orange bg-mercantil-orange/5'
                    : 'border-mercantil-line dark:border-mercantil-dark-line hover:border-mercantil-orange/60'
                }`}
              >
                <div className="text-sm font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{t.label}</div>
                <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">{t.helper}</div>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Versión */}
        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Versión
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {VERSIONS.map((v) => (
              <button
                type="button"
                key={v.value}
                onClick={() => setForm({ ...form, version: v.value })}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  form.version === v.value
                    ? 'border-mercantil-orange bg-mercantil-orange/5'
                    : 'border-mercantil-line dark:border-mercantil-dark-line hover:border-mercantil-orange/60'
                }`}
              >
                <div className="text-sm font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{v.label}</div>
                <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">{v.helper}</div>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Idioma */}
        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Idioma
          </legend>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => (
              <button
                type="button"
                key={l.value}
                onClick={() => setForm({ ...form, locale: l.value })}
                className={`px-3 py-1 text-xs rounded border ${
                  form.locale === l.value
                    ? 'border-mercantil-orange bg-mercantil-orange text-white'
                    : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange'
                }`}
                title={l.draft ? 'Borrador — requiere revisión nativa' : ''}
              >
                {l.label}{l.draft ? ' ⚠' : ''}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Más detalles (acordeón) */}
        <div className="mt-5 border-t border-mercantil-line dark:border-mercantil-dark-line pt-4">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-mercantil-orange hover:underline"
          >
            {showDetails ? '▼' : '▶'} Más detalles (subtipo, edad, gobernanza, bucket, módulos)
          </button>
          {showDetails && (
            <div className="mt-3 space-y-3 pl-3 border-l-2 border-mercantil-line dark:border-mercantil-dark-line">
              {isJuridica && (
                <>
                  <label className="block">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                      Subtipo / estructura
                    </span>
                    <select
                      value={form.clientSubtype ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          clientSubtype: (e.target.value || undefined) as JuridicaSubtype | undefined,
                        })
                      }
                      className="w-full rounded border border-mercantil-line dark:border-mercantil-dark-line px-2 py-1 text-sm bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
                    >
                      <option value="">(sin especificar)</option>
                      {JURIDICA_SUBTYPES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                      Órgano decisor
                    </span>
                    <input
                      type="text"
                      value={form.clientGovernance ?? ''}
                      onChange={(e) => setForm({ ...form, clientGovernance: e.target.value })}
                      placeholder="Ej. Comité de Inversiones"
                      className="w-full rounded border border-mercantil-line dark:border-mercantil-dark-line px-2 py-1 text-sm bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
                    />
                  </label>
                </>
              )}
              {!isJuridica && (
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                    Edad del cliente (opcional)
                  </span>
                  <input
                    type="number"
                    min={18}
                    max={120}
                    value={form.clientAge ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        clientAge: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="Ej. 45"
                    className="w-32 rounded border border-mercantil-line dark:border-mercantil-dark-line px-2 py-1 text-sm bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
                  />
                </label>
              )}

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                  Bucket Wealth Way
                </span>
                <div className="flex gap-2">
                  {BUCKETS.map((b) => (
                    <button
                      type="button"
                      key={b.value}
                      onClick={() => setForm({ ...form, bucket: b.value })}
                      className={`px-2.5 py-1 text-xs rounded border ${
                        form.bucket === b.value
                          ? 'border-mercantil-orange bg-mercantil-orange/10 text-mercantil-orange'
                          : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange/60'
                      }`}
                      title={b.helper}
                    >
                      {b.label}
                    </button>
                  ))}
                  <span className="text-xs text-mercantil-slate/70 self-center ml-1">
                    (default: {deriveBucket(config)})
                  </span>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                  Módulos opcionales
                </span>
                <div className="space-y-1.5">
                  <ModuleCheckbox
                    label="Análisis profundo de sleeves (~1pp extra)"
                    checked={form.modules.sleevesDetail}
                    onChange={(v) =>
                      setForm({ ...form, modules: { ...form.modules, sleevesDetail: v } })
                    }
                  />
                  <ModuleCheckbox
                    label="Stress tests por régimen histórico (~1pp extra)"
                    checked={form.modules.stressTests}
                    onChange={(v) =>
                      setForm({ ...form, modules: { ...form.modules, stressTests: v } })
                    }
                  />
                  <ModuleCheckbox
                    label="Sensibilidades / análisis comparativos (~1pp extra)"
                    checked={form.modules.sensitivities}
                    onChange={(v) =>
                      setForm({ ...form, modules: { ...form.modules, sensitivities: v } })
                    }
                  />
                  <ModuleCheckbox
                    label="Nota metodológica detallada (recomendado)"
                    checked={form.modules.methodology}
                    onChange={(v) =>
                      setForm({ ...form, modules: { ...form.modules, methodology: v } })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Carta personalizada del asesor */}
        <label className="block mt-5">
          <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
            Mensaje del asesor (opcional, aparece en la portada)
          </span>
          <textarea
            value={advisorNote}
            onChange={(e) => setAdvisorNote(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Mensaje breve que aparecerá destacado en la portada del documento."
            className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
          />
          <span className="block text-xs text-mercantil-slate mt-0.5">{advisorNote.length}/600</span>
        </label>

        {error && (
          <div className="mt-4 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 text-xs rounded bg-mercantil-orange text-white font-semibold hover:bg-mercantil-orange/90 disabled:opacity-50"
          >
            {busy ? '⏳ Generando…' : '📄 Generar PDF'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModuleCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer text-mercantil-slate dark:text-mercantil-dark-slate">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-mercantil-orange h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}
