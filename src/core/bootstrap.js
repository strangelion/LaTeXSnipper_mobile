// bootstrap.js — Platform setup: Theme, PWA, Service Worker, tab navigation.
// Runs before any feature modules are loaded.

import { initTheme, getThemeIcon } from '../ui/theme.js';

export function bootstrap() {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Theme
  const theme = initTheme();
  document.getElementById('themeToggle').innerHTML = getThemeIcon(theme);

  // Tab navigation
  setupTabs();

  // PWA install prompt
  setupInstallPrompt();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.bottom-nav button');
  const pages = document.querySelectorAll('.page');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      pages.forEach(p => p.classList.remove('active'));
      const page = document.getElementById('page-' + tab.dataset.page);
      if (page) page.classList.add('active');
    });
  });
}

function setupInstallPrompt() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBanner')?.classList.add('show');
  });
  document.getElementById('installBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBanner')?.classList.remove('show');
  });
  document.getElementById('dismissInstall')?.addEventListener('click', () => {
    document.getElementById('installBanner')?.classList.remove('show');
  });
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.getElementById('installBanner')?.classList.remove('show');
  }
}
