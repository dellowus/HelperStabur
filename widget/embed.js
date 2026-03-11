(function() {
  'use strict';

  var CONFIG = {
    apiUrl: (document.currentScript && document.currentScript.getAttribute('data-api')) || '',
    title: 'Помощник СТАБУР',
    subtitle: 'Отвечу на типовые вопросы по продукции и документации',
    placeholder: 'Напишите вопрос...',
    sendLabel: 'Отправить',
    openLabel: 'Чат',
    quickQuestions: [
      'Модельный ряд',
      'Модули расширения',
      'Протоколы',
      'Интерфейсы',
      'MasterSCADA 4D vs CODESYS'
    ],
    styles: {
      // Оранжевый под логотип/акценты СТАБУР
      // Более спокойный оранжевый (ближе к тону на сайте)
      primary: '#ff924c',
      primaryLight: '#ffab73',
      primaryDark: '#d96f2b',
      bg: '#f7fafc',
      text: '#2d3748',
      border: '#e2e8f0',
      radius: '12px',
      shadow: '0 4px 24px rgba(0,0,0,0.12)'
    }
  };

  if (!CONFIG.apiUrl) return;

  function ensureReady(cb) {
    if (document.body) return cb();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', cb, { once: true });
      return;
    }
    var tries = 0;
    var t = setInterval(function() {
      if (document.body) {
        clearInterval(t);
        cb();
        return;
      }
      tries += 1;
      if (tries > 50) clearInterval(t);
    }, 50);
  }

  ensureReady(function init() {
  var container = document.createElement('div');
  container.id = 'psve-helper-root';
  container.innerHTML =
    '<div class="psve-helper-toggle" role="button" aria-label="' + CONFIG.openLabel + '">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '</svg>' +
    '</div>' +
    '<div class="psve-helper-window" hidden>' +
      '<div class="psve-helper-header">' +
        '<div class="psve-helper-header-text">' +
          '<div class="psve-helper-title">' + CONFIG.title + '</div>' +
          '<div class="psve-helper-subtitle">' + (CONFIG.subtitle || '') + '</div>' +
        '</div>' +
        '<button type="button" class="psve-helper-close" aria-label="Закрыть">&times;</button>' +
      '</div>' +
      '<div class="psve-helper-quick"></div>' +
      '<div class="psve-helper-messages"></div>' +
      '<div class="psve-helper-form">' +
        '<textarea class="psve-helper-input" rows="2" placeholder="' + CONFIG.placeholder + '" maxlength="2000"></textarea>' +
        '<button type="button" class="psve-helper-send">' + CONFIG.sendLabel + '</button>' +
      '</div>' +
    '</div>';

  var s = document.createElement('style');
  s.textContent = [
    '#psve-helper-root{ position:fixed; bottom:20px; right:20px; z-index:99999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; }',
    '.psve-helper-toggle{ width:56px; height:56px; border-radius:50%; background: rgba(255,146,76,.88); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:' + CONFIG.styles.shadow + '; transition:transform .2s, background .2s, box-shadow .2s; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }',
    '.psve-helper-toggle:hover{ background: rgba(255,171,115,.94); transform:scale(1.05); box-shadow: 0 10px 28px rgba(0,0,0,0.18); }',
    '.psve-helper-window{ position:absolute; bottom:70px; right:0; width:390px; max-width:calc(100vw - 40px); height:560px; background: rgba(255,255,255,.86); border-radius:' + CONFIG.styles.radius + '; box-shadow:' + CONFIG.styles.shadow + '; border:1px solid rgba(226,232,240,.9); display:flex; flex-direction:column; overflow:hidden; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }',
    '.psve-helper-window[hidden]{ display:none !important; }',
    '.psve-helper-header{ padding:14px 16px; background: linear-gradient(135deg, rgba(255,146,76,.96), rgba(217,111,43,.96)); color:#fff; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }',
    '.psve-helper-header-text{ min-width:0; }',
    '.psve-helper-title{ font-weight:700; letter-spacing: .2px; }',
    '.psve-helper-subtitle{ margin-top:4px; font-size:12px; opacity:.9; line-height:1.25; }',
    '.psve-helper-close{ background:0; border:0; color:inherit; font-size:24px; line-height:1; cursor:pointer; opacity:.9; padding:0 4px; }',
    '.psve-helper-close:hover{ opacity:1; }',
    '.psve-helper-quick{ padding:10px 12px 0; background: transparent; display:flex; flex-wrap:nowrap; gap:8px; overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; scrollbar-width:thin; }',
    '.psve-helper-quick::-webkit-scrollbar{ height: 6px; }',
    '.psve-helper-quick::-webkit-scrollbar-thumb{ background: rgba(226,232,240,.9); border-radius: 999px; }',
    '.psve-helper-chip{ flex: 0 0 auto; border:1px solid rgba(226,232,240,.95); background: rgba(255,255,255,.72); color:' + CONFIG.styles.text + '; border-radius:999px; padding:7px 10px; font:inherit; cursor:pointer; line-height:1; transition: border-color .15s, color .15s, transform .15s, background .15s; white-space:nowrap; }',
    '.psve-helper-chip:hover{ border-color: rgba(255,146,76,.65); color:' + CONFIG.styles.primaryDark + '; transform: translateY(-1px); background: rgba(255,255,255,.9); }',
    '.psve-helper-messages{ flex:1; overflow-y:auto; padding:12px; background: rgba(247,250,252,.65); }',
    '.psve-helper-msg{ max-width:90%; margin-bottom:10px; padding:10px 12px; border-radius:10px; line-height:1.45; word-wrap:break-word; }',
    '.psve-helper-msg.user{ margin-left:auto; background: rgba(255,146,76,.90); color:#fff; }',
    '.psve-helper-msg.bot{ margin-right:auto; background: rgba(255,255,255,.78); border:1px solid rgba(226,232,240,.95); color:' + CONFIG.styles.text + '; }',
    '.psve-helper-msg.loading{ color:#718096; }',
    '.psve-helper-form{ padding:12px; border-top:1px solid rgba(226,232,240,.9); background: rgba(255,255,255,.82); display:flex; gap:8px; align-items:flex-end; }',
    '.psve-helper-input{ flex:1; resize:none; border:1px solid rgba(226,232,240,.95); border-radius:10px; padding:10px 12px; font:inherit; min-height:44px; max-height:120px; background: rgba(255,255,255,.85); }',
    '.psve-helper-input:focus{ outline:none; border-color: rgba(255,146,76,.65); box-shadow: 0 0 0 3px rgba(255,146,76,.16); }',
    '.psve-helper-send{ padding:10px 16px; background: rgba(255,146,76,.90); color:#fff; border:0; border-radius:10px; font-weight:700; cursor:pointer; white-space:nowrap; transition: background .15s, transform .15s; }',
    '.psve-helper-send:hover{ background: rgba(255,171,115,.94); transform: translateY(-1px); }',
    '.psve-helper-send:disabled{ opacity:.6; cursor:not-allowed; }'
  ].join('\n');
  document.head.appendChild(s);
  document.body.appendChild(container);

  var win = container.querySelector('.psve-helper-window');
  var toggle = container.querySelector('.psve-helper-toggle');
  var closeBtn = container.querySelector('.psve-helper-close');
  var quick = container.querySelector('.psve-helper-quick');
  var messages = container.querySelector('.psve-helper-messages');
  var input = container.querySelector('.psve-helper-input');
  var sendBtn = container.querySelector('.psve-helper-send');

  function open() { win.hidden = false; }
  function close() { win.hidden = true; }
  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  function renderQuickQuestions() {
    if (!quick) return;
    if (!Array.isArray(CONFIG.quickQuestions) || CONFIG.quickQuestions.length === 0) {
      quick.style.display = 'none';
      return;
    }
    quick.innerHTML = CONFIG.quickQuestions.map(function(q) {
      return '<button type="button" class="psve-helper-chip" data-q="' + encodeURIComponent(q) + '">' + q + '</button>';
    }).join('');
    quick.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest && e.target.closest('.psve-helper-chip');
      if (!btn) return;
      var q = btn.getAttribute('data-q');
      if (!q) return;
      var decoded = decodeURIComponent(q);
      input.value = decoded;
      send();
    });
  }

  function addMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'psve-helper-msg ' + who;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function send() {
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');
    var loading = addMsg('Ищем ответ...', 'bot loading');
    sendBtn.disabled = true;

    fetch(CONFIG.apiUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        page: window.location.href,
        referrer: document.referrer || ''
      })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        loading.remove();
        addMsg(data.answer || data.error || 'Ошибка ответа.', 'bot');
      })
      .catch(function() {
        loading.remove();
        addMsg('Не удалось отправить вопрос. Попробуйте позже или напишите на help@psvyaz.ru.', 'bot');
      })
      .then(function() { sendBtn.disabled = false; });
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  renderQuickQuestions();
  });
})();
