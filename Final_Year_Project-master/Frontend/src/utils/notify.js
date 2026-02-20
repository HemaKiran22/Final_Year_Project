/**
 * Unified notification utility — shows in-app toast + browser push notification.
 * Usage:  notify.success('Ride posted!');
 *         notify.error('Failed to join ride.');
 *         notify.info('Running late notification sent.');
 *         notify.warn('No seats available.');
 */

let toastContainer = null;

function ensureContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    max-width: 380px;
    width: 90vw;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
}

const ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warn: '⚠️',
};

const COLORS = {
  success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', bar: '#10b981' },
  error:   { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', bar: '#ef4444' },
  info:    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', bar: '#3b82f6' },
  warn:    { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', bar: '#f59e0b' },
};

function showToast(message, type = 'info', duration = 4000) {
  const container = ensureContainer();
  const c = COLORS[type] || COLORS.info;
  const icon = ICONS[type] || ICONS.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${c.bg};
    border: 1px solid ${c.border};
    border-left: 4px solid ${c.border};
    color: ${c.text};
    padding: 14px 18px 14px 14px;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    pointer-events: auto;
    animation: toastSlideIn 0.35s ease-out;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    max-width: 100%;
    word-break: break-word;
  `;

  toast.innerHTML = `
    <span style="font-size:18px;flex-shrink:0;margin-top:1px;">${icon}</span>
    <span style="flex:1;">${message}</span>
    <span style="cursor:pointer;opacity:0.5;font-size:16px;flex-shrink:0;margin-left:4px;" class="toast-close">&times;</span>
    <div style="position:absolute;bottom:0;left:0;height:3px;background:${c.bar};width:100%;animation:toastTimer ${duration}ms linear forwards;"></div>
  `;

  // Inject animation keyframes once
  if (!document.getElementById('toast-keyframes')) {
    const style = document.createElement('style');
    style.id = 'toast-keyframes';
    style.textContent = `
      @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes toastSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
      @keyframes toastTimer { from { width: 100%; } to { width: 0%; } }
    `;
    document.head.appendChild(style);
  }

  const dismiss = () => {
    toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  toast.addEventListener('click', dismiss);

  container.appendChild(toast);
  setTimeout(dismiss, duration);
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        try { new Notification(title, { body, icon: '/logo.png' }); } catch {}
      }
    });
  } else if (Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/logo.png' }); } catch {}
  }
}

const notify = {
  success(message, browserTitle) {
    showToast(message, 'success');
    if (browserTitle !== false) sendBrowserNotification(browserTitle || '✅ Colony Carpool', message);
  },
  error(message, browserTitle) {
    showToast(message, 'error');
    // Errors are in-app only — no browser push for errors
  },
  info(message, browserTitle) {
    showToast(message, 'info');
    if (browserTitle !== false) sendBrowserNotification(browserTitle || 'ℹ️ Colony Carpool', message);
  },
  warn(message, browserTitle) {
    showToast(message, 'warn');
    // Warnings are in-app only
  },
};

export default notify;
