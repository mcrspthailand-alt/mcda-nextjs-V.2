/** Wrap the unchanged legacy engine with a lifetime owned by one React mount. */
export function withEngineLifecycle(source: string): string {
  return `
(function (nativeWindow, nativeDocument) {
  const script = nativeDocument.currentScript;
  const mountId = script && script.dataset.mcdaMountId;
  const root = mountId && nativeDocument.querySelector('div[data-mcda-mount-id="' + mountId + '"]');
  // A removed script can still finish downloading. Never bind it to a newer UI.
  if (!script || !script.isConnected || !root || !root.isConnected) return;

  let disposed = false;
  const listeners = [];
  const timeouts = new Set();
  const intervals = new Set();
  const frames = new Set();
  const active = () => !disposed && script.isConnected && root.isConnected && root.dataset.mcdaMountId === mountId;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
    listeners.length = 0;
    timeouts.forEach(id => nativeWindow.clearTimeout(id));
    intervals.forEach(id => nativeWindow.clearInterval(id));
    frames.forEach(id => nativeWindow.cancelAnimationFrame(id));
    timeouts.clear(); intervals.clear(); frames.clear();
    delete script.dataset.mcdaInitialized;
  };
  script.mcdaDispose = dispose;

  function eventTarget(target) {
    return new Proxy(target, {
      get(object, key) {
        if (key === 'addEventListener') return (type, listener, options) => {
          if (!active()) return;
          object.addEventListener(type, listener, options);
          listeners.push([object, type, listener, options]);
        };
        const value = Reflect.get(object, key, object);
        return typeof value === 'function' ? value.bind(object) : value;
      }
    });
  }
  function setTimeout(callback, delay, ...args) {
    if (!active()) return 0;
    const id = nativeWindow.setTimeout(() => {
      timeouts.delete(id);
      if (active()) callback(...args);
    }, delay);
    timeouts.add(id);
    return id;
  }
  function clearTimeout(id) { timeouts.delete(id); nativeWindow.clearTimeout(id); }
  function setInterval(callback, delay, ...args) {
    if (!active()) return 0;
    const id = nativeWindow.setInterval(() => { if (active()) callback(...args); }, delay);
    intervals.add(id);
    return id;
  }
  function clearInterval(id) { intervals.delete(id); nativeWindow.clearInterval(id); }
  function requestAnimationFrame(callback) {
    if (!active()) return 0;
    const id = nativeWindow.requestAnimationFrame(time => {
      frames.delete(id);
      if (active()) callback(time);
    });
    frames.add(id);
    return id;
  }
  function cancelAnimationFrame(id) { frames.delete(id); nativeWindow.cancelAnimationFrame(id); }
  const document = eventTarget(nativeDocument);
  const eventWindow = eventTarget(nativeWindow);
  const timerMethods = { setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame };
  const window = new Proxy(eventWindow, {
    get(object, key) {
      if (key === 'document') return document;
      if (Object.prototype.hasOwnProperty.call(timerMethods, key)) return timerMethods[key];
      return Reflect.get(object, key);
    }
  });
  try {
${source}
    if (active()) script.dataset.mcdaInitialized = mountId;
    else dispose();
  } catch (error) {
    dispose();
    throw error;
  }
})(window, document);
`;
}
