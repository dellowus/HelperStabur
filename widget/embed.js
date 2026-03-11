(function() {
  'use strict';

  var CONFIG = {
    apiUrl: (document.currentScript && document.currentScript.getAttribute('data-api')) || '',
    title: 'Вопрос по ПЛК СТАБУР',
    placeholder: 'Напишите вопрос...',
    sendLabel: 'Отправить',
    openLabel: 'Чат',
    styles: {
      primary: '#1a365d',
      primaryLight: '#2c5282',
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
        '<span class="psve-helper-title">' + CONFIG.title + '</span>' +
        '<button type="button" class="psve-helper-close" aria-label="Закрыть">&times;</button>' +
      '</div>' +
      '<div class="psve-helper-messages"></div>' +
      '<div class="psve-helper-form">' +
        '<textarea class="psve-helper-input" rows="2" placeholder="' + CONFIG.placeholder + '" maxlength="2000"></textarea>' +
        '<button type="button" class="psve-helper-send">' + CONFIG.sendLabel + '</button>' +
      '</div>' +
    '</div>';

  var s = document.createElement('style');
  s.textContent = [
    '#psve-helper-root{ position:fixed; bottom:20px; right:20px; z-index:99999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; }',
    '.psve-helper-toggle{ width:56px; height:56px; border-radius:50%; background:' + CONFIG.styles.primary + '; color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:' + CONFIG.styles.shadow + '; transition:transform .2s, background .2s; }',
    '.psve-helper-toggle:hover{ background:' + CONFIG.styles.primaryLight + '; transform:scale(1.05); }',
    '.psve-helper-window{ position:absolute; bottom:70px; right:0; width:380px; max-width:calc(100vw - 40px); height:420px; background:#fff; border-radius:' + CONFIG.styles.radius + '; box-shadow:' + CONFIG.styles.shadow + '; border:1px solid ' + CONFIG.styles.border + '; display:flex; flex-direction:column; overflow:hidden; }',
    '.psve-helper-window[hidden]{ display:none !important; }',
    '.psve-helper-header{ padding:14px 16px; background:' + CONFIG.styles.primary + '; color:#fff; display:flex; align-items:center; justify-content:space-between; }',
    '.psve-helper-title{ font-weight:600; }',
    '.psve-helper-close{ background:0; border:0; color:inherit; font-size:24px; line-height:1; cursor:pointer; opacity:.9; padding:0 4px; }',
    '.psve-helper-close:hover{ opacity:1; }',
    '.psve-helper-messages{ flex:1; overflow-y:auto; padding:12px; background:' + CONFIG.styles.bg + '; }',
    '.psve-helper-msg{ max-width:90%; margin-bottom:10px; padding:10px 12px; border-radius:10px; line-height:1.45; word-wrap:break-word; }',
    '.psve-helper-msg.user{ margin-left:auto; background:' + CONFIG.styles.primary + '; color:#fff; }',
    '.psve-helper-msg.bot{ margin-right:auto; background:#fff; border:1px solid ' + CONFIG.styles.border + '; color:' + CONFIG.styles.text + '; }',
    '.psve-helper-msg.loading{ color:#718096; }',
    '.psve-helper-form{ padding:12px; border-top:1px solid ' + CONFIG.styles.border + '; background:#fff; display:flex; gap:8px; align-items:flex-end; }',
    '.psve-helper-input{ flex:1; resize:none; border:1px solid ' + CONFIG.styles.border + '; border-radius:8px; padding:10px 12px; font:inherit; min-height:44px; max-height:120px; }',
    '.psve-helper-input:focus{ outline:none; border-color:' + CONFIG.styles.primary + '; }',
    '.psve-helper-send{ padding:10px 16px; background:' + CONFIG.styles.primary + '; color:#fff; border:0; border-radius:8px; font-weight:600; cursor:pointer; white-space:nowrap; }',
    '.psve-helper-send:hover{ background:' + CONFIG.styles.primaryLight + '; }',
    '.psve-helper-send:disabled{ opacity:.6; cursor:not-allowed; }'
  ].join('\n');
  document.head.appendChild(s);
  document.body.appendChild(container);

  var win = container.querySelector('.psve-helper-window');
  var toggle = container.querySelector('.psve-helper-toggle');
  var closeBtn = container.querySelector('.psve-helper-close');
  var messages = container.querySelector('.psve-helper-messages');
  var input = container.querySelector('.psve-helper-input');
  var sendBtn = container.querySelector('.psve-helper-send');

  function open() { win.hidden = false; }
  function close() { win.hidden = true; }
  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

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
        addMsg('Не удалось отправить вопрос. Попробуйте позже или напишите на info@psve.ru.', 'bot');
      })
      .then(function() { sendBtn.disabled = false; });
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  });
})();
