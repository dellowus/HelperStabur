/**
 * Индексация документов для RAG.
 *
 * Использование:
 *   node ingest.js "c:\path\to\docs"
 * или
 *   npm run ingest -- "c:\path\to\docs"
 *
 * Поддержка: PDF (текст), XLSX (таблицы).
 * Результат: data/rag_index.json
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const xlsx = require('xlsx');

const OUT_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(OUT_DIR, 'rag_index.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  const t = normalize(s);
  if (!t) return [];
  return t.split(' ').filter(w => w.length >= 3);
}

function chunkText(text, maxLen = 900) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  let i = 0;
  while (i < t.length) {
    const slice = t.slice(i, i + maxLen);
    // стараемся резать по границе предложения
    let cut = slice.lastIndexOf('. ');
    if (cut < 200) cut = slice.lastIndexOf('; ');
    if (cut < 200) cut = slice.lastIndexOf(' ');
    if (cut < 200) cut = slice.length;
    const part = slice.slice(0, cut).trim();
    if (part) out.push(part);
    i += cut;
  }
  return out;
}

async function ingestPdf(filePath) {
  const data = await pdf(fs.readFileSync(filePath));
  const text = (data.text || '').trim();
  const chunks = chunkText(text);
  return chunks.map((c, idx) => ({
    text: c,
    tokens: tokenize(c),
    source: path.basename(filePath),
    page: null,
    chunk: idx + 1
  }));
}

function ingestXlsx(filePath) {
  const wb = xlsx.readFile(filePath);
  const chunks = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });
    // Собираем строки таблицы в читаемый текст
    const lines = rows
      .map(r => (r || []).map(c => String(c || '').trim()).filter(Boolean).join(' | '))
      .filter(Boolean);

    const text = lines.join('\n');
    const parts = chunkText(text, 900);
    for (let i = 0; i < parts.length; i++) {
      const c = parts[i];
      chunks.push({
        text: c,
        tokens: tokenize(c),
        source: `${path.basename(filePath)}#${sheetName}`,
        page: null,
        chunk: i + 1
      });
    }
  }
  return chunks;
}

async function main() {
  const cliDir = process.argv[2];
  const abs = path.resolve(cliDir || path.join(__dirname, 'docs'));
  if (!fs.existsSync(abs)) {
    console.error('Папка с документами не найдена, пропускаем индексацию:', abs);
    console.error('Создайте папку docs/ рядом с server.js и положите туда PDF/XLSX.');
    return;
  }

  const files = fs.readdirSync(abs).map(f => path.join(abs, f));
  const targets = files.filter(f => fs.statSync(f).isFile());

  const allChunks = [];
  for (const f of targets) {
    const ext = path.extname(f).toLowerCase();
    try {
      if (ext === '.pdf') {
        console.log('PDF:', f);
        allChunks.push(...await ingestPdf(f));
      } else if (ext === '.xlsx' || ext === '.xls') {
        console.log('XLSX:', f);
        allChunks.push(...ingestXlsx(f));
      }
    } catch (e) {
      console.error('Ошибка обработки', f, e);
    }
  }

  ensureDir(OUT_DIR);
  const index = {
    created_at: new Date().toISOString(),
    chunks: allChunks
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(index, null, 2), 'utf8');
  console.log('Готово. Индекс:', OUT_PATH);
  console.log('Фрагментов:', allChunks.length);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

