(function () {
  'use strict';

  var MAX_PROOF_BYTES = 200 * 1024;
  var LEGACY_KEYS = ['wcwd.worldid.debugger.v1', 'wcwd.worldid.playground.v1'];
  var EVENT_ALLOWLIST = new Set([
    'debugger_analyze',
    'debugger_clear',
    'playground_run',
    'playground_clear',
    'wizard_generate'
  ]);

  function copyToClipboard(text, statusEl) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      if (statusEl) statusEl.textContent = 'Clipboard not available';
      return Promise.resolve(false);
    }
    return navigator.clipboard.writeText(String(text || '')).then(function () {
      if (statusEl) {
        var original = statusEl.getAttribute('data-original-status') || statusEl.textContent || '';
        statusEl.setAttribute('data-original-status', original);
        statusEl.textContent = 'Copied';
        window.setTimeout(function () { statusEl.textContent = original; }, 1500);
      }
      return true;
    }).catch(function () {
      if (statusEl) statusEl.textContent = 'Copy failed';
      return false;
    });
  }

  function safeJsonParse(text) {
    try { return { ok: true, value: JSON.parse(text), error: null }; }
    catch (error) { return { ok: false, value: null, error: error }; }
  }

  function prettyJson(value) { return JSON.stringify(value, null, 2); }

  function saveFormState() {
    return false;
  }

  function loadFormState() {
    return null;
  }

  function clearLegacyProofStorage() {
    LEGACY_KEYS.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (_) {}
    });
  }

  function track(eventName) {
    if (!EVENT_ALLOWLIST.has(eventName)) return false;
    if (typeof gtag === 'function') gtag('event', eventName);
    return true;
  }

  function proofBytes(input) {
    return new TextEncoder().encode(input.value || '').length;
  }

  function addPrivacyUi() {
    var path = location.pathname || '/';
    if (path !== '/world-id/debugger/' && path !== '/world-id/playground/') return;
    var input = document.getElementById('proofJson');
    if (!input) return;

    input.setAttribute('data-ephemeral-proof', 'true');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    var card = input.closest('.card');
    if (card && !card.querySelector('[data-world-id-privacy-warning]')) {
      var warning = document.createElement('p');
      warning.className = 'note';
      warning.setAttribute('data-world-id-privacy-warning', 'true');
      warning.textContent = 'Proof JSON is ephemeral: it stays only in this active page session, is not saved to localStorage, and is never sent to analytics. Maximum input size: 200KB.';
      card.insertBefore(warning, input.parentElement);
    }

    var row = input.closest('.card').querySelector('.row');
    if (row && !document.getElementById('btnClearProof')) {
      var clear = document.createElement('button');
      clear.id = 'btnClearProof';
      clear.type = 'button';
      clear.className = 'btn ghost';
      clear.textContent = 'Clear proof and outputs';
      clear.addEventListener('click', function () {
        input.value = '';
        document.querySelectorAll('textarea[readonly]').forEach(function (output) { output.value = ''; });
        document.querySelectorAll('#parseSummary,#validationSummary,#diagnosisSummary,#runStatus,#proofStatus').forEach(function (node) { node.textContent = ''; });
        clearLegacyProofStorage();
        track(path.indexOf('debugger') >= 0 ? 'debugger_clear' : 'playground_clear');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      row.appendChild(clear);
    }

    function enforceLimit() {
      var tooLarge = proofBytes(input) > MAX_PROOF_BYTES;
      input.setCustomValidity(tooLarge ? 'Proof JSON exceeds the 200KB maximum.' : '');
      ['btnAnalyze', 'btnGenerate', 'btnRun'].forEach(function (id) {
        var button = document.getElementById(id);
        if (button && tooLarge) button.disabled = true;
      });
      var status = document.getElementById('proofStatus') || document.getElementById('copyStatus');
      if (tooLarge && status) status.textContent = 'Input rejected: proof JSON exceeds 200KB.';
    }
    input.addEventListener('input', enforceLimit);
    enforceLimit();
  }

  clearLegacyProofStorage();
  window.WorldIdTools = {
    copyToClipboard: copyToClipboard,
    safeJsonParse: safeJsonParse,
    prettyJson: prettyJson,
    saveFormState: saveFormState,
    loadFormState: loadFormState,
    clearLegacyProofStorage: clearLegacyProofStorage,
    maxProofBytes: MAX_PROOF_BYTES,
    track: track
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addPrivacyUi);
  else addPrivacyUi();
})();
