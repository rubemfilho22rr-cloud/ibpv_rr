(() => {
  'use strict';

  let released = false;

  function releaseInterface() {
    const body = document.body;
    const curtain = document.getElementById('intro-curtain');
    const welcome = document.querySelector('[data-screen="welcome"]');

    curtain?.classList.add('is-gone');
    welcome?.classList.add('section-visible');
    document.documentElement.classList.add('ui-core-ready');
    body?.classList.add('ui-ready');

    if (body) {
      body.classList.remove('morphing', 'is-transitioning');
    }

    released = true;
    window.dispatchEvent(new CustomEvent('ibpv-session-ready'));
  }

  window.IBPVSessionGate = Object.freeze({
    release: releaseInterface,
    isReady: () => released
  });
})();
