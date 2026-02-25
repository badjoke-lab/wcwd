(function () {
  'use strict';

  var storageKey = 'wcwd.worldid.playground.v1';

  function $(id) {
    return document.getElementById(id);
  }

  function isValidUrl(value) {
    if (!value) return false;
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function buildBodyString(parsedProof) {
    return window.WorldIdTools.prettyJson({
      proof: parsedProof,
    });
  }

  function setRunButtonState() {
    var urlOk = isValidUrl($('verifierUrl').value.trim());
    var proofParsed = window.WorldIdTools.safeJsonParse($('proofJson').value || '');
    $('btnRun').disabled = !(urlOk && proofParsed.ok);
  }

  function saveState() {
    if (!window.WorldIdTools || !window.WorldIdTools.saveFormState) return;
    window.WorldIdTools.saveFormState(storageKey, {
      verifierUrl: $('verifierUrl').value || '',
      proofJson: $('proofJson').value || '',
    });
  }

  function loadState() {
    var state = window.WorldIdTools.loadFormState(storageKey);
    if (!state || typeof state !== 'object') return;
    if (typeof state.verifierUrl === 'string') $('verifierUrl').value = state.verifierUrl;
    if (typeof state.proofJson === 'string') $('proofJson').value = state.proofJson;
  }

  function generateExamples() {
    var url = $('verifierUrl').value.trim();
    var parse = window.WorldIdTools.safeJsonParse($('proofJson').value || '');

    var payloadText;
    if (parse.ok) {
      payloadText = buildBodyString(parse.value);
      $('proofStatus').textContent = 'Proof JSON parsed successfully.';
      $('proofStatus').className = 'status success';
    } else {
      payloadText = window.WorldIdTools.prettyJson({ proof: '<paste-valid-json>' });
      $('proofStatus').textContent = 'Proof JSON is invalid. Examples use placeholder payload.';
      $('proofStatus').className = 'status warn';
    }

    var targetUrl = isValidUrl(url) ? url : 'https://your-api.example.com/world-id/verify';
    $('urlStatus').textContent = isValidUrl(url)
      ? 'Verifier URL looks valid.'
      : 'Enter a full URL (http/https). Example: https://your-api.example.com/world-id/verify';
    $('urlStatus').className = isValidUrl(url) ? 'status success' : 'status warn';

    var curlText = [
      'curl -X POST "' + targetUrl + '" \\',
      '  -H "Content-Type: application/json" \\',
      '  --data-raw ' + JSON.stringify(payloadText),
    ].join('\n');

    var fetchText = [
      'fetch(' + JSON.stringify(targetUrl) + ', {',
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      '  body: JSON.stringify(' + payloadText.split('\n').join('\n  ') + ')',
      '})',
      '  .then((res) => res.json())',
      '  .then((data) => console.log(data));',
    ].join('\n');

    var axiosText = [
      "import axios from 'axios';",
      '',
      'const payload = ' + payloadText.split('\n').join('\n') + ';',
      '',
      'axios.post(' + JSON.stringify(targetUrl) + ', payload, {',
      "  headers: { 'Content-Type': 'application/json' }",
      '}).then((response) => {',
      '  console.log(response.data);',
      '});',
    ].join('\n');

    $('curlOut').value = curlText;
    $('fetchOut').value = fetchText;
    $('axiosOut').value = axiosText;

    setRunButtonState();
    saveState();
  }

  function renderRunResult(message, type) {
    var el = $('runStatus');
    el.textContent = message;
    el.className = 'status ' + (type || 'info');
  }

  function setResultOutput(statusCode, bodyText) {
    $('resultCode').textContent = statusCode;
    var parsed = window.WorldIdTools.safeJsonParse(bodyText || '');
    $('resultBody').value = parsed.ok ? window.WorldIdTools.prettyJson(parsed.value) : (bodyText || '');
  }

  function runTest() {
    var url = $('verifierUrl').value.trim();
    var parse = window.WorldIdTools.safeJsonParse($('proofJson').value || '');
    if (!isValidUrl(url) || !parse.ok) {
      renderRunResult('Run disabled until URL is valid and proof JSON parses.', 'warn');
      return;
    }

    renderRunResult('Running request…', 'info');
    setResultOutput('-', '');

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildBodyString(parse.value),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          setResultOutput(String(res.status), text);
          renderRunResult('Request completed.', res.ok ? 'success' : 'warn');
        });
      })
      .catch(function () {
        renderRunResult('Network/CORS error: browser could not read response. Your endpoint may block CORS. Examples are still available below.', 'warn');
        setResultOutput('network/CORS', 'No response body available in browser context.');
      });
  }

  function wireCopy(buttonId, sourceId, statusId) {
    $(buttonId).addEventListener('click', function () {
      window.WorldIdTools.copyToClipboard($(sourceId).value || '', $(statusId));
    });
  }

  function init() {
    loadState();
    $('verifierUrl').addEventListener('input', function () {
      setRunButtonState();
      saveState();
    });
    $('proofJson').addEventListener('input', function () {
      setRunButtonState();
      saveState();
    });

    $('btnGenerate').addEventListener('click', generateExamples);
    $('btnRun').addEventListener('click', runTest);

    wireCopy('copyCurl', 'curlOut', 'copyCurlStatus');
    wireCopy('copyFetch', 'fetchOut', 'copyFetchStatus');
    wireCopy('copyAxios', 'axiosOut', 'copyAxiosStatus');

    generateExamples();
  }

  init();
})();
