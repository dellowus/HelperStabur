/**
 * Backend для виртуального помощника psve.ru
 * Токен Telegram хранится только здесь — в браузере его нет.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
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
    '💬 Вопрос с сайта psve.ru',
    '',
    text,
    '',
    meta.page ? `📄 Страница: ${meta.page}` : '',
    meta.referrer ? `🔗 Откуда: ${meta.referrer}` : ''
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
const { getAnswer } = require('./knowledge');

// Единственный публичный endpoint: принять вопрос, отправить в Telegram, вернуть ответ
app.post('/api/chat', async (req, res) => {
  try {
    const { message, page, referrer } = req.body || {};
    const text = (message || '').trim().slice(0, 2000);
    if (!text) {
      return res.status(400).json({ error: 'Пустое сообщение', answer: null });
    }

    // Сначала отправляем в Telegram (асинхронно, не блокируем ответ)
    sendToTelegram(text, { page, referrer }).catch(e => console.error('Telegram:', e));

    // Пытаемся дать умный ответ по базе знаний
    const answer = getAnswer(text);

    res.json({
      answer: answer || 'Спасибо за вопрос! Мы получили ваше сообщение и ответим в ближайшее время. Также можете связаться с нами: +7 (343) 364-42-60 доб. 129, info@psve.ru.',
      source: answer ? 'knowledge' : 'fallback'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Ошибка сервера',
      answer: 'Произошла ошибка. Попробуйте позже или напишите нам: info@psve.ru.'
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
