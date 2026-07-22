(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const app = document.getElementById('app');

  function clearTransientState() {
    body.classList.remove('morphing', 'is-transitioning', 'motion-fallback');
    if (app) app.style.filter = 'none';

    document.querySelectorAll('.screen, .center-card, .page-shell, .workspace, [data-animate]').forEach((el) => {
      el.style.removeProperty('filter');
    });
  }

  function guaranteeInitialScreen() {
    if (body.classList.contains('app-page')) return;
    const welcome = document.querySelector('[data-screen="welcome"]');
    if (!welcome) return;
    welcome.classList.add('section-visible');
    document.querySelectorAll('[data-screen="welcome"] [data-animate]').forEach((el) => {
      el.style.removeProperty('filter');
    });
  }

  function bindDialogSafety() {
    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('close', clearTransientState);
      dialog.addEventListener('cancel', () => setTimeout(clearTransientState, 0));
    });
  }

  function installAnimationWatchdog() {
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (body.classList.contains('is-transitioning') || body.classList.contains('morphing')) {
          clearTransientState();
          body.classList.add('motion-fallback');
          setTimeout(() => body.classList.remove('motion-fallback'), 80);
        }
      }, 1800);
    };

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-go], .profile-card, button')) arm();
    }, true);
  }

  function init() {
    clearTransientState();
    guaranteeInitialScreen();
    bindDialogSafety();
    installAnimationWatchdog();
    root.classList.add('ui-core-ready');
    body.classList.add('ui-ready');
    if (window.IBPVSessionGate?.isReady()) {
      document.getElementById('intro-curtain')?.classList.add('is-gone');
    }

    window.addEventListener('pageshow', () => {
      clearTransientState();
      guaranteeInitialScreen();
    });

    window.addEventListener('error', () => {
      clearTransientState();
      body.classList.add('motion-fallback');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
