(function () {
  'use strict';

  var storageKey = 'wcwd.worldid.debugger.v1';

  function $(id) {
    return document.getElementById(id);
  }

  function getKey(obj, primary, alternate) {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, primary)) return obj[primary];
    if (Object.prototype.hasOwnProperty.call(obj, alternate)) return obj[alternate];
    return undefined;
  }

  function typeOfValue(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function expectedTypeOk(name, value) {
    if (name === 'proof') {
      return typeof value === 'string' || (value && typeof value === 'object' && !Array.isArray(value));
    }
    return typeof value === 'string';
  }

  function buildDiagnosis(parseResult, parsedValue, validationItems) {
    var tips = [];

    if (!parseResult.ok) {
      tips.push('Parse error tips: ensure the JSON is valid (double quotes, no trailing commas, no comments).');
      tips.push('Parse error tips: copy raw object using JSON.stringify(result) before pasting.');
      return tips;
    }

    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      tips.push('Wrong type hint: top-level JSON must be an object.');
      return tips;
    }

    var missing = validationItems.filter(function (i) {
      return i.required && !i.present;
    });

    if (missing.length > 0) {
      tips.push('Missing keys hint: include required fields proof, nullifier_hash/nullifierHash, merkle_root/merkleRoot.');
    }

    var wrongTypes = validationItems.filter(function (i) {
      return i.present && !i.typeOk;
    });

    if (wrongTypes.length > 0) {
      tips.push('Wrong type hint: proof should be object|string; other fields should be strings.');
    }

    if (tips.length === 0) {
      tips.push('No obvious structural issues found in minimal shape check.');
    }

    return tips;
  }

  function renderList(container, items) {
    container.innerHTML = '';
    var ul = document.createElement('ul');
    for (var i = 0; i < items.length; i += 1) {
      var li = document.createElement('li');
      li.textContent = items[i];
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  function init() {
    var proofInput = $('proofJson');
    var analyzeBtn = $('btnAnalyze');
    var copyReportBtn = $('btnCopyReport');
    var reportOut = $('reportText');
    var parseSummary = $('parseSummary');
    var validationSummary = $('validationSummary');
    var diagnosisSummary = $('diagnosisSummary');

    var loaded = window.WorldIdTools && window.WorldIdTools.loadFormState
      ? window.WorldIdTools.loadFormState(storageKey)
      : null;
    if (loaded && typeof loaded.proofJson === 'string') {
      proofInput.value = loaded.proofJson;
    }

    function saveState() {
      if (!window.WorldIdTools || !window.WorldIdTools.saveFormState) return;
      window.WorldIdTools.saveFormState(storageKey, {
        proofJson: proofInput.value || '',
      });
    }

    function analyze() {
      var raw = proofInput.value || '';
      saveState();

      var parseResult = window.WorldIdTools.safeJsonParse(raw);
      var sizeBytes = raw.length;
      var sizeWarn = sizeBytes > 200 * 1024;

      var parseItems = [];
      parseItems.push(parseResult.ok ? 'JSON parsed: yes' : 'JSON parsed: no');
      parseItems.push('Input size: ' + sizeBytes + ' bytes' + (sizeWarn ? ' (warning: larger than 200KB)' : ''));

      var value = parseResult.ok ? parseResult.value : null;
      if (parseResult.ok && value && typeof value === 'object' && !Array.isArray(value)) {
        var keys = Object.keys(value);
        parseItems.push('Top-level keys found (' + keys.length + '): ' + (keys.length ? keys.join(', ') : '(none)'));
      } else if (parseResult.ok) {
        parseItems.push('Top-level keys found: none (top-level is not an object)');
      }

      if (!parseResult.ok && parseResult.error) {
        parseItems.push('Parse error: ' + parseResult.error.message);
      }

      renderList(parseSummary, parseItems);

      var checks = [
        { label: 'proof', primary: 'proof', alternate: 'proof', required: true },
        { label: 'nullifier_hash / nullifierHash', primary: 'nullifier_hash', alternate: 'nullifierHash', required: true },
        { label: 'merkle_root / merkleRoot', primary: 'merkle_root', alternate: 'merkleRoot', required: true },
        { label: 'signal (optional)', primary: 'signal', alternate: 'signal', required: false },
        { label: 'action (optional)', primary: 'action', alternate: 'action', required: false },
        { label: 'credential_type / credentialType (optional)', primary: 'credential_type', alternate: 'credentialType', required: false },
      ];

      var validationItems = checks.map(function (check) {
        var found = parseResult.ok && value && typeof value === 'object' && !Array.isArray(value)
          ? getKey(value, check.primary, check.alternate)
          : undefined;
        var present = typeof found !== 'undefined';
        var typeOk = !present ? !check.required : expectedTypeOk(check.primary, found);

        return {
          label: check.label,
          required: check.required,
          present: present,
          type: present ? typeOfValue(found) : '(missing)',
          typeOk: typeOk,
        };
      });

      var validationLines = validationItems.map(function (item) {
        var status = item.present ? (item.typeOk ? 'OK' : 'TYPE MISMATCH') : (item.required ? 'MISSING' : 'not provided');
        return item.label + ': ' + status + (item.present ? ' (type=' + item.type + ')' : '');
      });
      renderList(validationSummary, validationLines);

      var diagnosisLines = buildDiagnosis(parseResult, value, validationItems);
      if (sizeWarn) {
        diagnosisLines.push('Size warning: payload exceeds 200KB; transport or server limits may fail.');
      }
      renderList(diagnosisSummary, diagnosisLines);

      var reportLines = [
        'World ID Debugger Report',
        '========================',
        '',
        '[Parsed Summary]',
      ].concat(parseItems).concat(['', '[Validation Results]']).concat(validationLines).concat(['', '[Diagnosis]']).concat(diagnosisLines);

      reportOut.value = reportLines.join('\n');
    }

    analyzeBtn.addEventListener('click', analyze);
    proofInput.addEventListener('input', saveState);
    copyReportBtn.addEventListener('click', function () {
      var statusEl = $('copyStatus');
      window.WorldIdTools.copyToClipboard(reportOut.value || '', statusEl);
    });

    analyze();
  }

  init();
})();
