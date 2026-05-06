/**
 * Genera un visor HTML local autocontenido para revisar todos los .md y PDFs
 * relevantes del proyecto. Salida: research/index.html.
 *
 * Uso: npm run docs:viewer
 *
 * Características:
 *   - Sidebar fijo a la izquierda, agrupado por carpeta
 *   - Búsqueda en sidebar (filter por nombre)
 *   - Tema light/dark (persistido en localStorage)
 *   - Deep-linking por hash (#doc=path)
 *   - MDs renderizados con marked (embebido inline, sin internet)
 *   - PDFs en <iframe> con relative path + fallback "abrir directo"
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLANNER_ROOT = resolve(__dirname, '..');
const MERCANTIL_ROOT = resolve(PLANNER_ROOT, '..');
const OUTPUT = resolve(PLANNER_ROOT, 'research', 'index.html');

const MARKED_PATH = resolve(PLANNER_ROOT, 'node_modules', 'marked', 'lib', 'marked.umd.js');

/**
 * Estructura de archivos a indexar. Cada entrada es {label, type, path}
 * - type: 'md' | 'pdf'
 * - path: absoluto (lectura) y relativo a research/ (link en HTML)
 */
const TREE = [
  {
    group: 'Mercantil Planner',
    items: [
      { label: 'INSTRUCCIONES-PLANNER.md', file: 'INSTRUCCIONES-PLANNER.md', root: PLANNER_ROOT, rel: '..', type: 'md' },
      { label: 'progreso-planner.md', file: 'progreso-planner.md', root: PLANNER_ROOT, rel: '..', type: 'md' },
      { label: 'PROMPT-NUEVA-SESION.md', file: 'PROMPT-NUEVA-SESION.md', root: PLANNER_ROOT, rel: '..', type: 'md' },
      { label: 'README.md', file: 'README.md', root: PLANNER_ROOT, rel: '..', type: 'md' },
    ],
  },
  {
    group: 'Research — PDF de cierre',
    items: [
      { label: 'pdf-benchmark-industria.md', file: 'research/pdf-benchmark-industria.md', root: PLANNER_ROOT, rel: '.', type: 'md', name: 'pdf-benchmark-industria.md' },
      { label: 'decisiones-tecnicas-pdf.md', file: 'research/decisiones-tecnicas-pdf.md', root: PLANNER_ROOT, rel: '.', type: 'md', name: 'decisiones-tecnicas-pdf.md' },
    ],
  },
  {
    group: 'PDF samples (Wealth Way · Longevity)',
    items: [
      { label: 'pocho-longevity.es.pdf', file: 'research/samples/pocho-longevity.es.pdf', root: PLANNER_ROOT, rel: 'samples/pocho-longevity.es.pdf', type: 'pdf' },
      { label: 'pocho-longevity.en.pdf', file: 'research/samples/pocho-longevity.en.pdf', root: PLANNER_ROOT, rel: 'samples/pocho-longevity.en.pdf', type: 'pdf' },
      { label: 'pocho-longevity.fr.pdf', file: 'research/samples/pocho-longevity.fr.pdf', root: PLANNER_ROOT, rel: 'samples/pocho-longevity.fr.pdf', type: 'pdf' },
      { label: 'pocho-longevity.de.pdf', file: 'research/samples/pocho-longevity.de.pdf', root: PLANNER_ROOT, rel: 'samples/pocho-longevity.de.pdf', type: 'pdf' },
    ],
  },
  {
    group: 'Estudio Benchmark (raíz MERCANTIL)',
    items: [
      { label: 'MERCANTIL_RECAPITULACION_1.md', file: 'MERCANTIL_RECAPITULACION_1.md', root: MERCANTIL_ROOT, rel: '../../MERCANTIL_RECAPITULACION_1.md', type: 'md' },
      { label: 'progreso.md', file: 'progreso.md', root: MERCANTIL_ROOT, rel: '../../progreso.md', type: 'md' },
      { label: 'hallazgos.md', file: 'hallazgos.md', root: MERCANTIL_ROOT, rel: '../../hallazgos.md', type: 'md' },
      { label: 'instrucciones-proyecto.md', file: 'instrucciones-proyecto.md', root: MERCANTIL_ROOT, rel: '../../instrucciones-proyecto.md', type: 'md' },
    ],
  },
];

async function readMaybe(absPath) {
  try {
    return await readFile(absPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function buildDocs() {
  const docs = {};
  let total = 0;
  let missing = 0;
  for (const group of TREE) {
    for (const item of group.items) {
      const id = item.file;
      if (item.type === 'md') {
        const content = await readMaybe(resolve(item.root, item.file));
        if (content == null) {
          missing++;
          docs[id] = { type: 'md', content: `# Archivo no encontrado\n\n\`${item.file}\` no existe en \`${item.root}\` al momento de generar el visor.` };
        } else {
          docs[id] = { type: 'md', content };
          total++;
        }
      } else if (item.type === 'pdf') {
        docs[id] = { type: 'pdf', src: item.rel };
        total++;
      }
    }
  }
  return { docs, total, missing };
}

const HTML_TEMPLATE = (markedSource, treeJson, docsJson, generatedAt) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mercantil AWM · Visor de documentos</title>
<style>
  :root {
    --bg: #fafaf9;
    --surface: #ffffff;
    --sidebar-bg: #f4f4f5;
    --ink: #18181b;
    --body: #27272a;
    --muted: #71717a;
    --hairline: #e4e4e7;
    --accent: #1e3a8a;
    --accent-soft: #dbeafe;
    --code-bg: #f4f4f5;
    --code-fg: #18181b;
    --selection: #fef08a;
  }
  [data-theme="dark"] {
    --bg: #09090b;
    --surface: #0f0f12;
    --sidebar-bg: #131316;
    --ink: #fafafa;
    --body: #d4d4d8;
    --muted: #a1a1aa;
    --hairline: #27272a;
    --accent: #93c5fd;
    --accent-soft: #1e3a8a40;
    --code-bg: #18181b;
    --code-fg: #fafafa;
    --selection: #facc1540;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: flex; height: 100vh; overflow: hidden;
    background: var(--bg); color: var(--body);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    font-size: 15px; line-height: 1.6;
  }
  ::selection { background: var(--selection); }

  /* SIDEBAR */
  .sidebar {
    width: 320px; flex-shrink: 0; height: 100vh; overflow-y: auto;
    background: var(--sidebar-bg); border-right: 1px solid var(--hairline);
    display: flex; flex-direction: column;
  }
  .sidebar-header {
    padding: 18px 20px 12px; border-bottom: 1px solid var(--hairline);
    background: var(--sidebar-bg); position: sticky; top: 0; z-index: 2;
  }
  .sidebar-title {
    font-size: 13px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    color: var(--ink); margin: 0 0 4px;
  }
  .sidebar-sub { font-size: 11px; color: var(--muted); margin: 0 0 10px; }
  .search {
    width: 100%; padding: 8px 10px; font-size: 13px;
    border: 1px solid var(--hairline); border-radius: 6px;
    background: var(--surface); color: var(--body); outline: none;
  }
  .search:focus { border-color: var(--accent); }
  .theme-toggle {
    margin-top: 10px; width: 100%; padding: 6px 10px; font-size: 12px;
    border: 1px solid var(--hairline); background: var(--surface); color: var(--body);
    border-radius: 6px; cursor: pointer;
  }
  .theme-toggle:hover { border-color: var(--accent); }
  .tree { padding: 12px 0 24px; }
  .group { margin-bottom: 18px; }
  .group-label {
    font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
    color: var(--muted); padding: 6px 20px; margin: 0;
  }
  .item {
    display: flex; align-items: center; gap: 8px; padding: 7px 20px 7px 28px;
    color: var(--body); cursor: pointer; font-size: 13px; line-height: 1.3;
    border-left: 2px solid transparent; user-select: none;
  }
  .item:hover { background: var(--accent-soft); color: var(--ink); }
  .item.active { background: var(--accent-soft); color: var(--ink); border-left-color: var(--accent); font-weight: 600; }
  .item.hidden { display: none; }
  .item-icon { font-size: 13px; opacity: 0.7; }

  /* MAIN */
  .main {
    flex: 1; height: 100vh; overflow-y: auto;
    background: var(--bg); color: var(--body);
  }
  .toolbar {
    position: sticky; top: 0; z-index: 1;
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 32px; background: var(--bg); border-bottom: 1px solid var(--hairline);
    font-size: 12px; color: var(--muted);
  }
  .toolbar-actions { display: flex; gap: 8px; }
  .toolbar a {
    color: var(--accent); text-decoration: none; font-size: 12px;
    padding: 4px 10px; border: 1px solid var(--hairline); border-radius: 4px;
  }
  .toolbar a:hover { background: var(--accent-soft); }
  .content { padding: 28px 48px 80px; max-width: 920px; }
  .content.full { max-width: none; padding: 0; }

  /* MD STYLES */
  .md h1, .md h2, .md h3, .md h4 { color: var(--ink); line-height: 1.3; margin: 1.5em 0 0.5em; }
  .md h1 { font-size: 28px; border-bottom: 1px solid var(--hairline); padding-bottom: 0.3em; }
  .md h2 { font-size: 22px; margin-top: 2em; }
  .md h3 { font-size: 17px; }
  .md h4 { font-size: 15px; }
  .md p { margin: 0.8em 0; }
  .md a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .md ul, .md ol { padding-left: 1.5em; margin: 0.6em 0; }
  .md li { margin: 0.2em 0; }
  .md code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em; background: var(--code-bg); color: var(--code-fg);
    padding: 1px 5px; border-radius: 3px;
  }
  .md pre {
    background: var(--code-bg); color: var(--code-fg);
    padding: 14px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px;
    border: 1px solid var(--hairline); line-height: 1.45;
  }
  .md pre code { background: transparent; padding: 0; font-size: 13px; }
  .md blockquote {
    border-left: 3px solid var(--accent); padding: 0.4em 1em; margin: 1em 0;
    color: var(--muted); font-style: italic; background: var(--accent-soft);
    border-radius: 0 4px 4px 0;
  }
  .md table {
    border-collapse: collapse; margin: 1em 0; font-size: 13px;
    border: 1px solid var(--hairline);
  }
  .md th, .md td {
    border: 1px solid var(--hairline); padding: 6px 12px; text-align: left;
  }
  .md th { background: var(--code-bg); font-weight: 600; }
  .md hr { border: 0; border-top: 1px solid var(--hairline); margin: 2em 0; }
  .md img { max-width: 100%; }

  /* PDF VIEWER */
  .pdf-frame { width: 100%; height: calc(100vh - 50px); border: 0; display: block; }

  /* WELCOME */
  .welcome { padding: 60px 48px; max-width: 720px; }
  .welcome h1 { font-size: 32px; color: var(--ink); margin: 0 0 12px; }
  .welcome p { color: var(--muted); }
  .welcome .keys { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
  .welcome .key {
    padding: 10px 14px; background: var(--surface); border: 1px solid var(--hairline);
    border-radius: 6px; font-size: 13px; color: var(--body);
  }
  .welcome .key strong { color: var(--ink); }

  /* SCROLLBAR refinement */
  .sidebar::-webkit-scrollbar, .main::-webkit-scrollbar { width: 8px; }
  .sidebar::-webkit-scrollbar-thumb, .main::-webkit-scrollbar-thumb {
    background: var(--hairline); border-radius: 4px;
  }
</style>
</head>
<body>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <p class="sidebar-title">Mercantil AWM · Documentos</p>
      <p class="sidebar-sub">Generado ${generatedAt}</p>
      <input class="search" id="search" placeholder="Filtrar archivos…" autocomplete="off" />
      <button class="theme-toggle" id="themeToggle">Cambiar tema</button>
    </div>
    <nav class="tree" id="tree"></nav>
  </aside>
  <main class="main" id="main">
    <div class="toolbar" id="toolbar" style="display:none">
      <div id="breadcrumb"></div>
      <div class="toolbar-actions" id="toolbarActions"></div>
    </div>
    <div id="content" class="content"></div>
  </main>

  <script>
${markedSource}
  </script>
  <script>
    const TREE = ${treeJson};
    const DOCS = ${docsJson};

    const treeEl = document.getElementById('tree');
    const searchEl = document.getElementById('search');
    const contentEl = document.getElementById('content');
    const toolbarEl = document.getElementById('toolbar');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const toolbarActionsEl = document.getElementById('toolbarActions');
    const themeToggle = document.getElementById('themeToggle');

    function renderTree() {
      treeEl.innerHTML = TREE.map(group => \`
        <div class="group">
          <p class="group-label">\${group.group}</p>
          \${group.items.map(item => \`
            <div class="item" data-id="\${encodeURIComponent(item.file)}" data-label="\${item.label.toLowerCase()}">
              <span class="item-icon">\${item.type === 'pdf' ? '📑' : '📄'}</span>
              <span>\${item.label}</span>
            </div>
          \`).join('')}
        </div>
      \`).join('');
      treeEl.querySelectorAll('.item').forEach(el => {
        el.addEventListener('click', () => {
          const id = decodeURIComponent(el.dataset.id);
          location.hash = 'doc=' + encodeURIComponent(id);
        });
      });
    }

    function findItem(id) {
      for (const group of TREE) {
        for (const item of group.items) {
          if (item.file === id) return { group: group.group, item };
        }
      }
      return null;
    }

    function setActive(id) {
      treeEl.querySelectorAll('.item').forEach(el => {
        el.classList.toggle('active', decodeURIComponent(el.dataset.id) === id);
      });
    }

    function renderDoc(id) {
      const found = findItem(id);
      if (!found) {
        renderWelcome();
        return;
      }
      const { group, item } = found;
      const doc = DOCS[id];
      setActive(id);

      toolbarEl.style.display = 'flex';
      breadcrumbEl.textContent = group + ' / ' + item.label;
      toolbarActionsEl.innerHTML = '';

      if (doc.type === 'md') {
        contentEl.className = 'content';
        const html = window.marked.parse(doc.content);
        contentEl.innerHTML = '<article class="md">' + html + '</article>';
        const link = document.createElement('a');
        link.href = item.rel;
        link.target = '_blank';
        link.textContent = 'Abrir archivo';
        toolbarActionsEl.appendChild(link);
      } else if (doc.type === 'pdf') {
        contentEl.className = 'content full';
        contentEl.innerHTML = '<iframe class="pdf-frame" src="' + doc.src + '" title="' + item.label + '"></iframe>';
        const open = document.createElement('a');
        open.href = doc.src;
        open.target = '_blank';
        open.textContent = 'Abrir en nueva pestaña';
        toolbarActionsEl.appendChild(open);
      }
      contentEl.scrollTop = 0;
    }

    function renderWelcome() {
      toolbarEl.style.display = 'none';
      contentEl.className = 'content';
      contentEl.innerHTML = \`
        <div class="welcome">
          <h1>Mercantil AWM · Visor de documentos</h1>
          <p>Elegí un archivo del sidebar a la izquierda. Filtrá con la barra de búsqueda. Cambiá el tema con el botón.</p>
          <p>El visor renderiza Markdown localmente. Los PDFs se muestran en línea y también se pueden abrir en nueva pestaña.</p>
          <div class="keys">
            <div class="key"><strong>📄</strong> Markdown · render local</div>
            <div class="key"><strong>📑</strong> PDF · iframe</div>
            <div class="key"><strong>#deep-link</strong> URL recordable</div>
          </div>
        </div>
      \`;
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('mawm-doc-theme', theme);
    }
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(current === 'light' ? 'dark' : 'light');
    });
    applyTheme(localStorage.getItem('mawm-doc-theme') || 'light');

    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      treeEl.querySelectorAll('.item').forEach(el => {
        el.classList.toggle('hidden', q && !el.dataset.label.includes(q));
      });
    });

    function handleHash() {
      const m = location.hash.match(/doc=([^&]+)/);
      if (m) {
        renderDoc(decodeURIComponent(m[1]));
      } else {
        renderWelcome();
      }
    }
    window.addEventListener('hashchange', handleHash);

    renderTree();
    handleHash();
  </script>
</body>
</html>`;

async function main() {
  const markedSource = await readFile(MARKED_PATH, 'utf-8');
  const { docs, total, missing } = await buildDocs();

  const treeForJson = TREE.map(g => ({
    group: g.group,
    items: g.items.map(i => ({
      file: i.file,
      label: i.label,
      rel: i.rel,
      type: i.type,
    })),
  }));

  const generatedAt = new Date().toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
  const html = HTML_TEMPLATE(
    markedSource,
    JSON.stringify(treeForJson),
    JSON.stringify(docs),
    generatedAt,
  );

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, html, 'utf-8');

  const sizeKb = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
  console.log(`✓ Generado ${OUTPUT}`);
  console.log(`  ${total} documentos indexados (${missing} no encontrados), ${sizeKb} KB.`);
  console.log(`\nAbrí el archivo con doble click o desde Explorer:`);
  console.log(`  ${OUTPUT}`);
}

main().catch(err => {
  console.error('Falló la generación del visor:', err);
  process.exitCode = 1;
});
