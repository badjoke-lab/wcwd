(function () {
  function copyToClipboard(text, statusEl) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      if (statusEl) {
        statusEl.textContent = 'Clipboard not available';
      }
      return Promise.resolve(false);
    }

    return navigator.clipboard
      .writeText(String(text ?? ''))
      .then(function () {
        if (statusEl) {
          var original = statusEl.getAttribute('data-original-status') || statusEl.textContent;
          statusEl.setAttribute('data-original-status', original || '');
          statusEl.textContent = 'Copied';
          window.setTimeout(function () {
            statusEl.textContent = statusEl.getAttribute('data-original-status') || '';
          }, 1500);
        }
        return true;
      })
      .catch(function () {
        if (statusEl) {
          statusEl.textContent = 'Copy failed';
          window.setTimeout(function () {
            statusEl.textContent = statusEl.getAttribute('data-original-status') || '';
          }, 1500);
        }
        return false;
      });
  }

  function safeJsonParse(text) {
    try {
      return { ok: true, value: JSON.parse(text), error: null };
    } catch (error) {
      return { ok: false, value: null, error: error };
    }
  }

  function prettyJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function saveFormState(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadFormState(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      var parsed = safeJsonParse(raw);
      return parsed.ok ? parsed.value : null;
    } catch (_) {
      return null;
    }
  }

  window.WorldIdTools = {
    copyToClipboard: copyToClipboard,
    safeJsonParse: safeJsonParse,
    prettyJson: prettyJson,
    saveFormState: saveFormState,
    loadFormState: loadFormState,
  };
})();
