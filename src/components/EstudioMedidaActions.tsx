/**
 * Botones de acción del Estudio a la Medida — generar PDF nuevo o subir un
 * PDF anterior para retomar el seguimiento. Componente compacto que se
 * inserta en el `CaseStudyPanel` después del bloque de resultados.
 */
import { useRef, useState } from 'react';

import { useCaseStudyStore } from '../state/caseStudyStore';
import EstudioMedidaPdfModal from './EstudioMedidaPdfModal';

export default function EstudioMedidaActions() {
  const restoreFromPdf = useCaseStudyStore((s) => s.restoreFromPdf);
  const tracking = useCaseStudyStore((s) => s.tracking);
  const clearTracking = useCaseStudyStore((s) => s.clearTracking);

  const [modalOpen, setModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const { loadEstudioMedidaFromPdf } = await import('../pdf/estudio-medida/upload');
      const out = await loadEstudioMedidaFromPdf(file);
      if (out.kind === 'ok') {
        restoreFromPdf({
          config: out.state.config,
          result: out.state.result,
          savedVariants: out.state.savedVariants,
          tracking: {
            previousDate: out.state.generatedAt,
            previousSessionId: out.state.sessionId,
            trackingDays: out.trackingDays,
          },
        });
      } else {
        setUploadError(out.reason);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-1">
            Estudio a la Medida — entrega al cliente
          </h3>
          <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate max-w-2xl">
            Genera un PDF personalizado con IPS / directrices, estrategia, resultados y apéndice legal. El estado del
            estudio queda embebido en el PDF — para el seguimiento, subí el documento anterior y la herramienta restituye
            la configuración y los resultados automáticamente.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy}
            className="px-4 py-2 text-xs rounded border border-mercantil-navy text-mercantil-navy dark:text-mercantil-dark-ink hover:bg-mercantil-navy hover:text-white transition disabled:opacity-50"
          >
            {uploadBusy ? '⏳ Procesando…' : '📂 Subir estudio anterior'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 text-xs rounded bg-mercantil-orange text-white font-semibold hover:bg-mercantil-orange/90"
          >
            📄 Generar Estudio a la Medida
          </button>
        </div>
      </div>

      {tracking && (
        <div className="mt-3 p-3 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 flex-wrap">
          <span>
            ✓ Estudio anterior cargado · Generado:{' '}
            <strong>{new Date(tracking.previousDate).toLocaleDateString('es-VE')}</strong>{' '}
            · Seguimiento: <strong>hoy ({tracking.trackingDays} días después)</strong> · ID: {tracking.previousSessionId}
          </span>
          <button
            type="button"
            onClick={clearTracking}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 underline"
          >
            Quitar etiqueta
          </button>
        </div>
      )}

      {uploadError && (
        <div className="mt-3 p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
          ⚠ {uploadError}
        </div>
      )}

      <EstudioMedidaPdfModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
