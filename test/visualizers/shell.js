(function () {
  function withQueryFlag(flag, enabled) {
    const url = new URL(window.location.href);
    if (enabled) {
      url.searchParams.set(flag, '1');
    } else {
      url.searchParams.delete(flag);
    }
    return url;
  }

  function normalizeState(state) {
    const allowed = ['ok', 'stale', 'error', 'empty'];
    return allowed.indexOf(state) >= 0 ? state : 'ok';
  }

  function formatValue(value) {
    if (value === undefined || value === null || value === '') return '—';
    return String(value);
  }

  function createMiniStats(items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'viz-mini-stats';

    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || {};
      const card = document.createElement('article');
      card.className = 'viz-mini-stat';

      const label = document.createElement('p');
      label.className = 'viz-mini-stat-label';
      label.textContent = formatValue(item.label);

      const value = document.createElement('p');
      value.className = 'viz-mini-stat-value';
      value.textContent = formatValue(item.value);

      card.append(label, value);

      if (item.sub) {
        const sub = document.createElement('p');
        sub.className = 'viz-mini-stat-sub';
        sub.textContent = String(item.sub);
        card.appendChild(sub);
      }

      wrapper.appendChild(card);
    }

    return wrapper;
  }

  function createLegend(items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'viz-legend';

    const title = document.createElement('p');
    title.className = 'viz-legend-title';
    title.textContent = 'Legend';
    wrapper.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'viz-legend-list';

    const normalizedItems = Array.isArray(items) && items.length
      ? items
      : [
        { kind: 'dot', tone: 'thin', label: 'Small flow' },
        { kind: 'dot', tone: 'thick', label: 'Whale flow' },
        { kind: 'line', tone: 'in', label: 'Inflow' },
        { kind: 'line', tone: 'out', label: 'Outflow' }
      ];

    for (let i = 0; i < normalizedItems.length; i += 1) {
      const entry = normalizedItems[i];
      const item = document.createElement('li');
      item.className = 'viz-legend-item';

      const marker = document.createElement('span');
      marker.className = 'viz-legend-marker';
      if (entry.kind === 'line') {
        marker.classList.add('is-line');
      } else {
        marker.classList.add('is-dot');
      }
      if (entry.tone) marker.classList.add('is-' + entry.tone);

      const label = document.createElement('span');
      label.textContent = formatValue(entry.label);

      item.append(marker, label);
      list.appendChild(item);
    }

    wrapper.appendChild(list);
    return wrapper;
  }

  function createHint(text) {
    const hint = document.createElement('p');
    hint.className = 'viz-hint';
    hint.textContent = text || 'Inflow is absorb / outflow is emit. Thicker motion means larger flow.';
    return hint;
  }

  function createStateBanner(payload) {
    const state = normalizeState(payload && payload.kind);
    const config = {
      ok: {
        label: 'Live',
        text: (payload && payload.message) || 'Streaming updates.',
        freeTier: false
      },
      stale: {
        label: 'Stale',
        text: (payload && payload.message) || 'Showing the last successful snapshot while reconnecting.',
        freeTier: true
      },
      error: {
        label: 'Error',
        text: (payload && payload.message) || 'Unable to fetch data right now. Please retry in a moment.',
        freeTier: true
      },
      empty: {
        label: 'Empty',
        text: (payload && payload.message) || 'No records in this interval yet.',
        freeTier: false
      }
    };

    const picked = config[state];
    const banner = document.createElement('section');
    banner.className = 'viz-state-banner is-' + state;

    const row = document.createElement('div');
    row.className = 'viz-state-row';

    const badge = document.createElement('span');
    badge.className = 'viz-state-badge';
    badge.textContent = picked.label;

    const text = document.createElement('p');
    text.className = 'viz-state-text';
    text.textContent = picked.text;

    row.append(badge, text);
    banner.appendChild(row);

    if (picked.freeTier) {
      const note = document.createElement('p');
      note.className = 'viz-state-note';
      note.textContent = 'Free-tier mode';
      banner.appendChild(note);
    }

    return banner;
  }

  function createDebugPanel(data) {
    const wrap = document.createElement('details');
    wrap.className = 'viz-debug-panel';

    const summary = document.createElement('summary');
    summary.textContent = 'Debug data';

    const pre = document.createElement('pre');
    const payload = data || {};
    pre.textContent = JSON.stringify(payload, null, 2);

    wrap.append(summary, pre);
    return wrap;
  }

  function createShell(options) {
    const root = document.querySelector('[data-visualizer-shell]');
    if (!root) return;

    const title = options.title || 'Visualizer';
    const description = options.description || '';
    const query = new URLSearchParams(window.location.search);
    const isLite = query.get('lite') === '1';
    const isDebug = query.get('debug') === '1';

    const shell = document.createElement('section');
    shell.className = 'visualizer-shell';

    const header = document.createElement('div');
    header.className = 'visualizer-shell-header';

    const headingWrap = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = title;
    headingWrap.appendChild(heading);

    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = description;
    headingWrap.appendChild(desc);

    const controls = document.createElement('div');
    controls.className = 'visualizer-shell-controls';

    const liteToggleLabel = document.createElement('label');
    liteToggleLabel.className = 'visualizer-shell-toggle';

    const liteToggleInput = document.createElement('input');
    liteToggleInput.type = 'checkbox';
    liteToggleInput.checked = isLite;
    liteToggleInput.setAttribute('aria-label', 'Lightweight mode');
    liteToggleInput.addEventListener('change', function () {
      const next = withQueryFlag('lite', liteToggleInput.checked);
      window.history.replaceState({}, '', next);
      window.dispatchEvent(new CustomEvent('visualizer:lite-change', {
        detail: { isLite: liteToggleInput.checked }
      }));
    });

    const liteToggleText = document.createElement('span');
    liteToggleText.textContent = 'Lightweight mode';
    liteToggleLabel.append(liteToggleInput, liteToggleText);

    const debugToggleLabel = document.createElement('label');
    debugToggleLabel.className = 'visualizer-shell-toggle';

    const debugToggleInput = document.createElement('input');
    debugToggleInput.type = 'checkbox';
    debugToggleInput.checked = isDebug;
    debugToggleInput.setAttribute('aria-label', 'Debug mode');
    debugToggleInput.addEventListener('change', function () {
      const next = withQueryFlag('debug', debugToggleInput.checked);
      window.history.replaceState({}, '', next);
      window.dispatchEvent(new CustomEvent('visualizer:debug-change', {
        detail: { isDebug: debugToggleInput.checked }
      }));
    });

    const debugToggleText = document.createElement('span');
    debugToggleText.textContent = 'Debug';
    debugToggleLabel.append(debugToggleInput, debugToggleText);

    controls.append(liteToggleLabel, debugToggleLabel);
    header.append(headingWrap, controls);

    const topRegion = document.createElement('div');
    topRegion.className = 'visualizer-shell-top';

    const canvasRegion = document.createElement('div');
    canvasRegion.className = 'visualizer-shell-canvas';

    const content = document.querySelector('[data-visualizer-content]');
    if (content) {
      canvasRegion.appendChild(content);
    }

    const bottomRegion = document.createElement('div');
    bottomRegion.className = 'visualizer-shell-bottom';

    shell.append(header, topRegion, canvasRegion, bottomRegion);
    root.appendChild(shell);

    function setTopContent(node) {
      topRegion.innerHTML = '';
      if (node) topRegion.appendChild(node);
    }

    function setBottomContent(nodes) {
      bottomRegion.innerHTML = '';
      for (let i = 0; i < nodes.length; i += 1) {
        if (nodes[i]) bottomRegion.appendChild(nodes[i]);
      }
    }

    const stateData = {
      miniStats: options.miniStats || null,
      legend: options.legend || null,
      hint: options.hint || '',
      state: options.state || { kind: 'ok' },
      debugData: options.debugData || null,
      isDebug: isDebug
    };

    function renderShellParts() {
      setTopContent(stateData.miniStats ? createMiniStats(stateData.miniStats.items) : null);
      const blocks = [];
      blocks.push(createStateBanner(stateData.state));
      if (stateData.legend) blocks.push(createLegend(stateData.legend.items));
      if (stateData.hint) blocks.push(createHint(stateData.hint));
      if (stateData.isDebug && stateData.debugData) blocks.push(createDebugPanel(stateData.debugData));
      setBottomContent(blocks);
    }

    debugToggleInput.addEventListener('change', function () {
      stateData.isDebug = debugToggleInput.checked;
      renderShellParts();
    });

    renderShellParts();

    window.dispatchEvent(new CustomEvent('visualizer:lite-change', {
      detail: { isLite: isLite }
    }));

    window.dispatchEvent(new CustomEvent('visualizer:debug-change', {
      detail: { isDebug: isDebug }
    }));

    return {
      isLite: isLite,
      isDebug: isDebug,
      setLite: function (nextLite) {
        const resolved = Boolean(nextLite);
        liteToggleInput.checked = resolved;
        const next = withQueryFlag('lite', resolved);
        window.history.replaceState({}, '', next);
        window.dispatchEvent(new CustomEvent('visualizer:lite-change', {
          detail: { isLite: resolved }
        }));
      },
      setMiniStats: function (miniStats) {
        stateData.miniStats = miniStats;
        renderShellParts();
      },
      setLegend: function (legend) {
        stateData.legend = legend;
        renderShellParts();
      },
      setHint: function (hint) {
        stateData.hint = hint;
        renderShellParts();
      },
      setState: function (state) {
        stateData.state = state || { kind: 'ok' };
        renderShellParts();
      },
      setDebugData: function (debugData) {
        stateData.debugData = debugData;
        renderShellParts();
      }
    };
  }

  window.VisualizerShell = {
    createShell: createShell,
    isLite: function () {
      return new URLSearchParams(window.location.search).get('lite') === '1';
    },
    isDebug: function () {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    },
    onLiteChange: function (handler) {
      const listener = function (event) {
        if (typeof handler === 'function') {
          handler(Boolean(event.detail && event.detail.isLite));
        }
      };
      window.addEventListener('visualizer:lite-change', listener);
      return function () {
        window.removeEventListener('visualizer:lite-change', listener);
      };
    },
    onDebugChange: function (handler) {
      const listener = function (event) {
        if (typeof handler === 'function') {
          handler(Boolean(event.detail && event.detail.isDebug));
        }
      };
      window.addEventListener('visualizer:debug-change', listener);
      return function () {
        window.removeEventListener('visualizer:debug-change', listener);
      };
    }
  };
})();
