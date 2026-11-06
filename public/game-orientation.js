// Game-owned mobile presentation. No canvas rotation or rule/profile changes.
(() => {
  if (document.documentElement.dataset.mobileOrientation !== 'landscape') return;
  const live = document.currentScript?.dataset.liveGame === 'true';
  const touch = matchMedia('(pointer: coarse)');
  const root = document.documentElement;
  const pointers = new Map();
  let gate, blocked = false, previousFocus, locking = false, locked = false;
  const needsRotation = () => touch.matches && innerHeight > innerWidth;
  // Also available to asynchronous launch handlers before the dialog mounts.
  root.dataset.orientationBlocked = String(needsRotation());

  addEventListener('pointerdown', event => {
    if (!blocked) pointers.set(event.pointerId, {target:event.target, type:event.pointerType});
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    addEventListener(type, event => pointers.delete(event.pointerId), true);
  }
  // Modal dialogs block element input; window-level game hotkeys need a guard too.
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'contextmenu', 'wheel']) {
    addEventListener(type, event => {
      if (!blocked) return;
      const inside = event.target instanceof Node && gate?.contains(event.target);
      if (type.startsWith('key')) {
        if (!inside || event.key === 'Escape') event.preventDefault();
        event.stopImmediatePropagation();
      } else if (!inside) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, {capture:true, passive:false});
  }

  function update() {
    if (!gate) return;
    const next = needsRotation();
    root.dataset.orientationBlocked = String(next);
    if (next === blocked) return;
    if (next) {
      previousFocus = document.activeElement;
      // Cancel drags before blocking events, so releasing after rotation cannot fire.
      for (const [pointerId, {target, type}] of [...pointers]) {
        target.dispatchEvent(new PointerEvent('pointercancel', {bubbles:true, pointerId, pointerType:type}));
        if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
      }
      pointers.clear();
      blocked = true;
      window.dispatchEvent(new Event('blur'));
      document.exitPointerLock?.();
      gate.showModal();
    } else {
      blocked = false;
      gate.close();
      const menu = [...document.querySelectorAll('dialog[open]')].at(-1);
      const focus = previousFocus?.isConnected && (!menu || menu.contains(previousFocus))
        ? previousFocus : menu?.querySelector('button:not([disabled]),a[href]');
      focus?.focus({preventScroll:true});
    }
    document.dispatchEvent(new CustomEvent('utxoplay:orientation', {detail:{blocked}}));
  }

  function fullscreenDocument() {
    try { if (parent !== window && parent.location.origin === location.origin) return parent.document; } catch {}
    return document;
  }
  async function enterLandscape(requestFullscreen = true) {
    if (locking || !touch.matches) return;
    locking = true;
    try {
      const doc = fullscreenDocument();
      if (requestFullscreen && !doc.fullscreenElement && !document.fullscreenElement) {
        try { await doc.documentElement.requestFullscreen?.(); } catch {}
      }
      try {
        if (screen.orientation?.lock) { await screen.orientation.lock('landscape'); locked = true; }
      } catch {}
      if (needsRotation()) gate.querySelector('[role="status"]').textContent = 'Turn your phone sideways. If it stays upright, turn off your device’s rotation lock.';
    } finally { locking = false; update(); }
  }

  function mount() {
    const style = document.createElement('style');
    style.textContent = `
      #game-orientation-gate{box-sizing:border-box;position:fixed;inset:0;width:100%;height:100%;height:100dvh;max-width:none;max-height:none;margin:0;border:0;border-radius:0;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));overflow:auto;background:#101a25;color:#edf5ef;font:16px/1.6 system-ui;text-align:center;overscroll-behavior:contain}
      #game-orientation-gate:not([open]){display:none!important}
      #game-orientation-gate[open]{display:grid;place-items:center}
      #game-orientation-gate::backdrop{background:#101a25}
      #game-orientation-gate .orientation-content{display:flex;align-items:center;flex-direction:column;gap:18px;max-width:380px}
      #game-orientation-gate .orientation-phone{box-sizing:border-box;width:86px;height:48px;border:3px solid #8ee6b0;border-radius:10px;font-size:26px;line-height:40px}
      #game-orientation-gate h2{margin:0;font:700 clamp(26px,7vw,36px)/1.2 system-ui;color:inherit}
      #game-orientation-gate p{margin:0;color:#c4d1ce;font:inherit}
      #game-orientation-gate button{min-height:48px;max-width:100%;padding:12px 22px;border:0;border-radius:12px;background:#8ee6b0;color:#10251a;font:700 16px system-ui;cursor:pointer}
      #game-orientation-gate a{display:inline-flex;align-items:center;min-height:44px;color:#c4d1ce;font:14px system-ui}
      #game-orientation-gate :focus-visible{outline:3px solid #fff;outline-offset:4px}
      #game-orientation-gate small{font:13px/1.5 system-ui;color:#a3b6b1}
    `;
    document.head.append(style);
    gate = document.createElement('dialog');
    gate.id = 'game-orientation-gate';
    gate.setAttribute('aria-labelledby', 'game-orientation-title');
    gate.setAttribute('aria-describedby', 'game-orientation-description');
    gate.innerHTML = `<div class="orientation-content"><span class="orientation-phone" aria-hidden="true">↻</span><h2 id="game-orientation-title">Rotate to play</h2><p id="game-orientation-description">This game plays in landscape.<br>Turn your phone sideways.</p><button type="button" autofocus>Enter landscape</button><p role="status"></p><small>${live ? 'Live matches continue while you rotate. Your controls are released.' : 'Rotate back to landscape to continue. Your controls are released.'}</small><a href="/" target="_top">Back to store</a></div>`;
    (document.querySelector('.game-surface') || document.body).append(gate);
    gate.querySelector('button').onclick = () => enterLandscape();
    gate.addEventListener('cancel', event => event.preventDefault());
    // A late-loaded game may open its own menu. Keep the rotation gate above it.
    let gateParent = gate.parentElement;
    new MutationObserver(records => {
      // Startup loaders can temporarily mark body-level controls inert before
      // the game shell moves them. The rotation dialog must remain usable.
      if (gate.inert) gate.inert = false;
      if (!blocked) return;
      const moved = gate.parentElement !== gateParent;
      gateParent = gate.parentElement;
      const openedMenu = records.some(({type, attributeName, target}) => type === 'attributes' && attributeName === 'open' && target !== gate && target.tagName === 'DIALOG' && target.open);
      // Reparenting an open dialog removes it from the browser's top layer.
      if ((moved || openedMenu) && gate.open) gate.close();
      if (!gate.open) gate.showModal();
    }).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['open', 'inert']});
    addEventListener('resize', update);
    addEventListener('pageshow', update);
    touch.addEventListener('change', update);
    screen.orientation?.addEventListener('change', update);
    const onFullscreen = () => {
      const doc = fullscreenDocument();
      if (doc.fullscreenElement || document.fullscreenElement) void enterLandscape(false);
      update();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    const host = fullscreenDocument();
    if (host !== document) host.addEventListener('fullscreenchange', onFullscreen);
    addEventListener('pagehide', () => {
      if (locked) { try { screen.orientation?.unlock?.(); } catch {} locked = false; }
      if (host !== document) host.removeEventListener('fullscreenchange', onFullscreen);
    });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
