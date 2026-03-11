const fs = require('fs');
const path = require('path');

const INDEX_PATH = process.env.RAG_INDEX_PATH || path.join(__dirname, 'data', 'rag_index.json');

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

function loadIndex() {
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.chunks)) return { chunks: [] };
    return parsed;
  } catch {
    return { chunks: [] };
  }
}

function retrieve(query, chunks, k = 6) {
  const qTokens = tokenize(query);
  const qSet = new Set(qTokens);
  if (qSet.size === 0) return [];

  const scored = chunks.map((c) => {
    const cTokens = c.tokens || tokenize(c.text);
    let score = 0;
    for (const w of cTokens) if (qSet.has(w)) score += 1;
    // небольшой бонус, если точная фраза встречается
    const qNorm = normalize(query);
    const cNorm = normalize(c.text);
    if (qNorm && cNorm.includes(qNorm)) score += 5;
    return { chunk: c, score };
  }).filter(x => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(x => x.chunk);
}

async function callOpenRouterLLM({ apiKey, model, question, context, siteUrl }) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const sys = [
    'Ты — виртуальный помощник компании СТАБУР.',
    'Отвечай кратко, по делу, на русском.',
    'Отвечай ТОЛЬКО опираясь на контекст из документов ниже. Если в контексте нет ответа — честно скажи, что информации нет, и предложи уточнить по почте help@psvyaz.ru.',
    'Не выдумывай характеристики, цены, протоколы и интерфейсы.'
  ].join(' ');

  const user = [
    'Контекст из документов:',
    context && context.length ? context : '(контекст не найден)',
    '',
    'Вопрос:',
    question
  ].join('\n');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(siteUrl ? { 'HTTP-Referer': siteUrl, 'X-Title': 'HelperStabur' } : {})
    },
    body: JSON.stringify({
      model: model || 'openrouter/free',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      temperature: 0.2
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function answerWithRag(question) {
  const index = loadIndex();
  const chunks = index.chunks || [];
  if (chunks.length === 0) return null;

  const top = retrieve(question, chunks, Number(process.env.RAG_TOP_K || 6));
  const context = top.map((c, i) => {
    const src = c.source ? `Источник: ${c.source}` : 'Источник: (неизвестно)';
    const page = c.page ? `, стр.: ${c.page}` : '';
    return `### Фрагмент ${i + 1}\n${src}${page}\n${c.text}`;
  }).join('\n\n');

  const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
  if (provider !== 'openrouter') {
    throw new Error('Only openrouter provider is implemented in this build');
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  return await callOpenRouterLLM({
    apiKey,
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    question,
    context,
    siteUrl: process.env.SITE_URL || 'https://psve.ru'
  });
}

module.exports = {
  loadIndex,
  answerWithRag,
  INDEX_PATH
};

