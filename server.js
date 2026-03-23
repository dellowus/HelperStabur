/**
 * Backend для виртуального помощника psve.ru
 * Токен Telegram хранится только здесь — в браузере его нет.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const geoip = require('geoip-lite');
const { answerWithRag } = require('./rag');

const app = express();
// Чтобы корректно получать IP за прокси (Railway, Cloudflare, Nginx)
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://psve.ru';

// Разрешаем только ваш сайт (и localhost для теста)
const corsOptions = {
  origin: (origin, cb) => {
    const allowed = [ALLOWED_ORIGIN, 'https://www.psve.ru', 'http://localhost:63342', 'http://127.0.0.1:5500'];
    if (!origin || allowed.some(o => origin === o || origin.startsWith('https://project12911407'))) {
      cb(null, true);
    } else {
      cb(new Error('CORS not allowed'));
    }
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Отправка сообщения в Telegram (токен только на сервере)
async function sendToTelegram(text, meta = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return;
  }
  const fullText = [
    '💬 Вопрос с сайта',
    '',
    meta.page ? `1) Откуда: ${meta.page}` : '1) Откуда: (неизвестно)',
    meta.referrer ? `   Referrer: ${meta.referrer}` : '',
    meta.location ? `2) Локация: ${meta.location}` : '2) Локация: (не определена)',
    '',
    `3) Вопрос: ${text}`,
    '',
    meta.answer ? `4) Ответ бота: ${meta.answer}` : '4) Ответ бота: (не сформирован)'
  ].filter(Boolean).join('\n');

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: fullText.slice(0, 4096),
      disable_web_page_preview: true
    })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Telegram error:', res.status, err);
  }
}

// Загрузка базы знаний для ответов
const { getAnswer, getPinnedAnswer } = require('./knowledge');

function hasModelLikeCode(text) {
  // Примитивная эвристика: сочетание букв/цифр длиной >=4 (ETH232, PLC100, HMI07 и т.п.)
  if (!text) return false;
  return /[A-Za-zА-Яа-я]{2,}\d{2,}/.test(text);
}

// Единственный публичный endpoint: принять вопрос, отправить в Telegram, вернуть ответ
app.post('/api/chat', async (req, res) => {
  try {
    const { message, page, referrer } = req.body || {};
    const text = (message || '').trim().slice(0, 2000);
    if (!text) {
      return res.status(400).json({ error: 'Пустое сообщение', answer: null });
    }

    // 0) Закреплённые ответы (выше RAG) — чтобы LLM не выдумывала списки (например протоколы)
    let answer = getPinnedAnswer(text);
    let source = answer ? 'pinned' : 'fallback';

    // 1) Пытаемся ответить через LLM+документы (RAG), если включено и pinned не сработал
    if (!answer) {
      try {
        if ((process.env.RAG_ENABLED || '').toLowerCase() === 'true') {
          answer = await answerWithRag(text);
        }
      } catch (e) {
        console.error('RAG/LLM error:', e?.message || e);
      }
    }

    // 2) Если RAG не дал ответа — опционально берём базу знаний по ключевым словам
    if (!answer) {
      // Если вопрос выглядит как запрос по конкретной модели/индексу (ETH232 и т.п.),
      // лучше честно сказать, что точного ответа нет, чем давать общий текст.
      if (!hasModelLikeCode(text)) {
        answer = getAnswer(text);
        if (answer) source = 'knowledge';
      }
    } else if (source !== 'pinned') {
      source = 'rag';
    }
    const footer = '\n\nВсе вопросы и уточнения пишите на help@psvyaz.ru';
    const baseFallback = hasModelLikeCode(text)
      ? 'По этому конкретному модулю или обозначению я не нашёл в документации точного ответа. Пожалуйста, уточните вопрос у специалистов.'
      : 'Спасибо за вопрос! Мы получили ваше сообщение и ответим в ближайшее время. Также можете связаться с нами: +7 (343) 364-42-60 доб. 129.';

    const finalAnswer = (answer || baseFallback) + footer;

    // Геолокация по IP (очень грубо, но без внешних сервисов)
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip;
    const geo = ip ? geoip.lookup(ip) : null;
    const location = geo
      ? [geo.country, geo.region, geo.city].filter(Boolean).join(', ')
      : null;

    // Отправляем в Telegram (асинхронно, не блокируем ответ)
    sendToTelegram(text, { page, referrer, location, answer: finalAnswer }).catch(e => console.error('Telegram:', e));

    res.json({ answer: finalAnswer, source });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Ошибка сервера',
      answer: 'Произошла ошибка. Попробуйте позже.\n\nВсе вопросы и уточнения пишите на help@psvyaz.ru'
    });
  }
});

// Проверка здоровья (без секретов)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'helperstabur' });
});

// Раздача статики виджета (опционально, можно подключать с вашего домена)
app.use('/widget', express.static(path.join(__dirname, 'widget')));

app.listen(PORT, () => {
  console.log(`HelperStabur: http://localhost:${PORT}`);
  if (!TELEGRAM_BOT_TOKEN) console.warn('TELEGRAM_BOT_TOKEN не задан — уведомления в Telegram отключены.');
});
