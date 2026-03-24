(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const PRESET_BRIDGES = [
    { label: 'L2 Standard Bridge', address: '0x4200000000000000000000000000000000000010' },
    { label: 'L1 Bridge Proxy', address: '0x470458c91978d2d929704489ad730dc3e3001113' },
    { label: 'Across SpokePool', address: '0x09aea4b2242abc8bb4bb78d537a67a245a7bec64' }
  ];

  function normalizeMetric(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric));
  }

  function asRatioText(value) {
    return Math.round(normalizeMetric(value) * 100) + '%';
  }

  function formatCount(value) {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    return numeric.toLocaleString('en-US');
  }

  function normalizeAddress(addr) {
    const s = String(addr || '').trim().toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(s) ? s : '';
  }

  function uniq(list) {
    return Array.from(new Set(list));
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function getAddressesFromUrl() {
    const q = new URLSearchParams(window.location.search).get('addresses') || '';
    return uniq(
      q.split(',')
        .map((s) => normalizeAddress(s))
        .filter(Boolean)
    );
  }

  function setAddressesToUrl(addresses) {
    const url = new URL(window.location.href);
    const next = uniq((addresses || []).map(normalizeAddress).filter(Boolean));
    if (next.length) {
      url.searchParams.set('addresses', next.join(','));
    } else {
      url.searchParams.delete('addresses');
    }
    window.history.replaceState({}, '', url);
  }

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs || {}).forEach(function ([k, v]) {
      node.setAttribute(k, String(v));
    });
    return node;
  }

  function createSvgScene(host) {
    const wrap = document.createElement('div');
    wrap.style.width = '100%';
    wrap.style.minHeight = '360px';
    wrap.style.border = '1px solid rgba(0,0,0,0.08)';
    wrap.style.borderRadius = '16px';
    wrap.style.background = 'rgba(248,248,249,0.95)';
    wrap.style.overflow = 'hidden';
    wrap.style.position = 'relative';

    const svg = el('svg', {
      viewBox: '0 0 1000 560',
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': 'Worldchain bridge activity visualization'
    });

    const bg = el('rect', {
      x: 0, y: 0, width: 1000, height: 560,
      fill: 'rgba(248,248,249,0.95)'
    });

    const grid = el('g', { opacity: '0.65' });
    for (let x = 0; x <= 1000; x += 40) {
      grid.appendChild(el('line', {
        x1: x, y1: 0, x2: x, y2: 560,
        stroke: 'rgba(20,20,20,0.05)',
        'stroke-width': 1
      }));
    }
    for (let y = 0; y <= 560; y += 40) {
      grid.appendChild(el('line', {
        x1: 0, y1: y, x2: 1000, y2: y,
        stroke: 'rgba(20,20,20,0.05)',
        'stroke-width': 1
      }));
    }

    const labels = el('g', {});
    const modeLabel = el('text', {
      x: 32, y: 44,
      'font-size': 18,
      'font-weight': 700,
      fill: 'rgba(20,20,20,0.84)'
    });
    modeLabel.textContent = 'Activity only';

    const subLabel = el('text', {
      x: 32, y: 72,
      'font-size': 14,
      fill: 'rgba(20,20,20,0.58)'
    });
    subLabel.textContent = 'No applied bridge addresses';

    labels.append(modeLabel, subLabel);

    const guideLeft = el('text', {
      x: 72, y: 510,
      'font-size': 13,
      fill: 'rgba(20,20,20,0.45)'
    });
    guideLeft.textContent = 'Activity stream';

    const guideCenter = el('text', {
      x: 470, y: 510,
      'font-size': 13,
      fill: 'rgba(20,20,20,0.45)'
    });
    guideCenter.textContent = 'Bridge hub';

    labels.append(guideLeft, guideCenter);

    const centerGroup = el('g', {});
    const centerCore = el('circle', {
      cx: 500, cy: 280, r: 24,
      fill: 'rgba(20,20,20,0.08)'
    });
    const centerRing = el('circle', {
      cx: 500, cy: 280, r: 58,
      fill: 'none',
      stroke: 'rgba(20,20,20,0.18)',
      'stroke-width': 2
    });
    centerGroup.append(centerCore, centerRing);

    const activityLayer = el('g', {});
    const inLayer = el('g', {});
    const outLayer = el('g', {});
    const accentLayer = el('g', {});

    svg.append(bg, grid, activityLayer, accentLayer, inLayer, outLayer, centerGroup, labels);
    wrap.appendChild(svg);
    host.appendChild(wrap);

    return {
      wrap,
      svg,
      modeLabel,
      subLabel,
      centerCore,
      centerRing,
      activityLayer,
      inLayer,
      outLayer,
      accentLayer
    };
  }

  function clearLayer(layer) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function renderActivityOnly(scene, metrics) {
    clearLayer(scene.activityLayer);
    clearLayer(scene.inLayer);
    clearLayer(scene.outLayer);
    clearLayer(scene.accentLayer);

    scene.modeLabel.textContent = 'Activity only';
    scene.subLabel.textContent = 'No applied bridge addresses';

    const activity = normalizeMetric(metrics.activity);
    const ringR = 44 + activity * 24;
    scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.05)');
    scene.centerRing.setAttribute('r', String(ringR));
    scene.centerRing.setAttribute('stroke', 'rgba(20,20,20,0.12)');
    scene.centerRing.setAttribute('stroke-width', String(1.5 + activity * 1.2));

    const count = 12 + Math.round(activity * 16);
    for (let i = 0; i < count; i += 1) {
      const y = 110 + (i % 9) * 38 + ((i * 17) % 11);
      const x = 60 + ((i * 67 + Date.now() / 80) % 860);
      const r = 2 + ((i * 3) % 3) + activity * 1.5;
      scene.activityLayer.appendChild(el('circle', {
        cx: x,
        cy: y,
        r: r.toFixed(1),
        fill: 'rgba(20,20,20,0.34)'
      }));
    }

    const stream = el('path', {
      d: 'M 70 280 C 220 240, 350 320, 500 280 C 650 240, 780 320, 930 280',
      fill: 'none',
      stroke: 'rgba(20,20,20,0.16)',
      'stroke-width': 2.5 + activity * 2
    });
    scene.accentLayer.appendChild(stream);
  }

  function renderBridgeEmpty(scene, metrics) {
      clearLayer(scene.activityLayer);
      clearLayer(scene.inLayer);
      clearLayer(scene.outLayer);
      clearLayer(scene.accentLayer);

      scene.modeLabel.textContent = 'Bridge mode';
      scene.subLabel.textContent = 'No bridge tx in current window';

      scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.08)');
      scene.centerRing.setAttribute('r', '60');
      scene.centerRing.setAttribute('stroke', 'rgba(20,20,20,0.18)');
      scene.centerRing.setAttribute('stroke-width', '2');
    }

  function renderBridgeActive(scene, metrics) {
      clearLayer(scene.activityLayer);
      clearLayer(scene.inLayer);
      clearLayer(scene.outLayer);
      clearLayer(scene.accentLayer);

      const inFlow = normalizeMetric(metrics.inFlow);
      const outFlow = normalizeMetric(metrics.outFlow);

      scene.modeLabel.textContent = 'Bridge mode';
      scene.subLabel.textContent = 'Bridge rendering disabled for safety test';

      scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.10)');
      scene.centerRing.setAttribute('r', String(64 + (inFlow + outFlow) * 8));
      scene.centerRing.setAttribute('stroke', 'rgba(20,20,20,0.24)');
      scene.centerRing.setAttribute('stroke-width', '2.4');
    }

  function bootstrap(shellController) {
    const root = document.querySelector('[data-visualizer-content]');
    if (!root || !window.DataLayer) return;
    root.innerHTML = '';

    const controls = document.createElement('section');
    controls.className = 'viz-bridge-controls';
    controls.style.marginBottom = '16px';

    const presetTitle = document.createElement('div');
    presetTitle.textContent = 'Preset bridge addresses';
    presetTitle.style.fontWeight = '600';
    presetTitle.style.marginBottom = '8px';

    const presetWrap = document.createElement('div');
    presetWrap.style.display = 'flex';
    presetWrap.style.flexWrap = 'wrap';
    presetWrap.style.gap = '8px';
    presetWrap.style.marginBottom = '12px';

    PRESET_BRIDGES.forEach(function (item) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'visualizer-shell-toggle';
      btn.textContent = item.label;
      btn.dataset.address = item.address;
      presetWrap.appendChild(btn);
    });

    const addWrap = document.createElement('div');
    addWrap.style.display = 'flex';
    addWrap.style.gap = '8px';
    addWrap.style.flexWrap = 'wrap';
    addWrap.style.alignItems = 'center';
    addWrap.style.marginBottom = '12px';

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Add one custom bridge address (0x...)';
    customInput.style.flex = '1 1 340px';
    customInput.style.minWidth = '240px';
    customInput.style.padding = '10px 12px';
    customInput.style.border = '1px solid rgba(0,0,0,0.12)';
    customInput.style.borderRadius = '10px';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn';
    addBtn.textContent = 'Add';

    addWrap.append(customInput, addBtn);

    const selectedWrap = document.createElement('div');
    selectedWrap.style.border = '1px solid rgba(0,0,0,0.08)';
    selectedWrap.style.borderRadius = '12px';
    selectedWrap.style.padding = '12px';
    selectedWrap.style.marginBottom = '12px';
    selectedWrap.style.background = 'rgba(255,255,255,0.55)';

    const selectedHeader = document.createElement('div');
    selectedHeader.style.display = 'flex';
    selectedHeader.style.justifyContent = 'space-between';
    selectedHeader.style.alignItems = 'center';
    selectedHeader.style.gap = '12px';
    selectedHeader.style.marginBottom = '10px';

    const selectedTitle = document.createElement('div');
    selectedTitle.style.fontWeight = '600';
    selectedTitle.textContent = 'Selected bridge addresses (0)';

    const selectedActions = document.createElement('div');
    selectedActions.style.display = 'flex';
    selectedActions.style.gap = '8px';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn';
    resetBtn.textContent = 'Reset';

    selectedActions.append(resetBtn);
    selectedHeader.append(selectedTitle, selectedActions);

    const selectedList = document.createElement('div');
    selectedList.style.display = 'flex';
    selectedList.style.flexDirection = 'column';
    selectedList.style.gap = '8px';

    selectedWrap.append(selectedHeader, selectedList);

    const applyRow = document.createElement('div');
    applyRow.style.display = 'flex';
    applyRow.style.alignItems = 'center';
    applyRow.style.gap = '10px';
    applyRow.style.flexWrap = 'wrap';
    applyRow.style.marginBottom = '16px';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn';
    applyBtn.textContent = 'Apply';

    const applyStatus = document.createElement('div');
    applyStatus.style.fontSize = '14px';
    applyStatus.style.color = 'rgba(0,0,0,0.62)';
    applyStatus.textContent = 'No changes yet.';

    applyRow.append(applyBtn, applyStatus);

    controls.append(presetTitle, presetWrap, addWrap, selectedWrap, applyRow);

    const sceneHost = document.createElement('div');
    root.append(controls, sceneHost);

    const scene = createSvgScene(sceneHost);

    let workingAddresses = getAddressesFromUrl();
    let appliedAddresses = workingAddresses.slice();
    let pollHandle = null;

    const metrics = {
      activity: 0,
      matchedRoutes: 0,
      inFlow: 0,
      outFlow: 0,
      depositCount: 0,
      withdrawCount: 0,
      uniqueUsers: 0,
      samples: 0,
      bridgeConfigured: false,
      selectedBridges: [],
      isStale: false,
      source: 'n/a',
      windowBlocks: 0,
      lastUpdated: null,
      ttlMs: 2500,
      staleMs: 25000
    };

    function refreshPresetButtons() {
      const set = new Set(workingAddresses);
      presetWrap.querySelectorAll('button[data-address]').forEach(function (btn) {
        const active = set.has(btn.dataset.address);
        btn.style.background = active ? 'rgba(20,20,20,0.08)' : '';
        btn.style.borderColor = active ? 'rgba(20,20,20,0.22)' : '';
      });
    }

    function renderSelectedList() {
      selectedTitle.textContent = 'Selected bridge addresses (' + workingAddresses.length + ')';
      selectedList.innerHTML = '';

      if (!workingAddresses.length) {
        const empty = document.createElement('div');
        empty.style.fontSize = '14px';
        empty.style.color = 'rgba(0,0,0,0.55)';
        empty.textContent = 'No addresses selected. Apply will use activity-only mode.';
        selectedList.appendChild(empty);
      } else {
        workingAddresses.forEach(function (addr) {
          const preset = PRESET_BRIDGES.find(function (p) { return p.address === addr; });

          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.alignItems = 'center';
          row.style.gap = '12px';
          row.style.padding = '8px 10px';
          row.style.border = '1px solid rgba(0,0,0,0.08)';
          row.style.borderRadius = '10px';
          row.style.background = 'rgba(255,255,255,0.7)';

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.flexDirection = 'column';
          left.style.gap = '2px';

          const label = document.createElement('div');
          label.style.fontWeight = '600';
          label.textContent = preset ? preset.label : 'Custom address';

          const value = document.createElement('div');
          value.style.fontSize = '13px';
          value.style.color = 'rgba(0,0,0,0.62)';
          value.textContent = addr;

          left.append(label, value);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = '×';
          removeBtn.title = 'Remove';
          removeBtn.style.width = '28px';
          removeBtn.style.height = '28px';
          removeBtn.style.borderRadius = '999px';
          removeBtn.style.border = '1px solid rgba(0,0,0,0.12)';
          removeBtn.style.background = 'rgba(255,255,255,0.92)';
          removeBtn.style.cursor = 'pointer';
          removeBtn.style.fontSize = '16px';
          removeBtn.style.lineHeight = '1';
          removeBtn.style.display = 'inline-flex';
          removeBtn.style.alignItems = 'center';
          removeBtn.style.justifyContent = 'center';
          removeBtn.addEventListener('click', function () {
            workingAddresses = workingAddresses.filter(function (x) { return x !== addr; });
            refreshSelectionUi();
          });

          row.append(left, removeBtn);
          selectedList.appendChild(row);
        });
      }

      const dirty = !arraysEqual(workingAddresses, appliedAddresses);
      if (dirty) {
        applyStatus.textContent = 'Pending changes. Apply to update visualization.';
      } else if (metrics.lastUpdated) {
        applyStatus.textContent = 'Watching ' + appliedAddresses.length + ' address(es). Updated just now.';
      } else {
        applyStatus.textContent = 'No changes yet.';
      }
    }

    function refreshSelectionUi() {
      refreshPresetButtons();
      renderSelectedList();
    }

    function addAddress(addr) {
      const normalized = normalizeAddress(addr);
      if (!normalized) {
        applyStatus.textContent = 'Invalid address. Enter a single 0x... address.';
        return;
      }
      if (!workingAddresses.includes(normalized)) {
        workingAddresses = workingAddresses.concat([normalized]);
      }
      customInput.value = '';
      refreshSelectionUi();
    }

    function buildEndpoint() {
      const params = new URLSearchParams();
      params.set('lite', '0');
      if (appliedAddresses.length) {
        params.set('addresses', appliedAddresses.join(','));
      }
      return '/api/viz/wormhole?' + params.toString();
    }

    function applyShellUi() {
      if (!shellController) return;

      shellController.setMiniStats({
        items: [
          { label: 'Mode', value: 'Safe test', sub: metrics.bridgeConfigured ? 'addresses applied' : 'no addresses' },
          { label: 'Addresses', value: formatCount(appliedAddresses.length), sub: 'Applied' },
          { label: 'Blocks', value: formatCount(metrics.windowBlocks), sub: 'Recent window' },
          { label: 'Source', value: 'RPC', sub: 'World Chain' }
        ]
      });

      shellController.setLegend({
        items: [
          { kind: 'dot', tone: 'thin', label: 'Safe test mode' },
          { kind: 'dot', tone: 'thin', label: 'Bridge branch disabled in frontend' },
          { kind: 'line', tone: 'thin', label: 'Used only to isolate crash cause' }
        ]
      });

      shellController.setHint('Safe test: frontend bridge branch disabled. If crash still happens, cause is outside bridge scene rendering.');

      shellController.setState({
        kind: metrics.isStale ? 'stale' : 'ok',
        message: metrics.bridgeConfigured
          ? 'Addresses applied, but frontend bridge branch is disabled for isolation.'
          : 'No applied bridge addresses.'
      });
    }

    function renderScene() {
      renderActivityOnly(scene, metrics);
    }

    async function pollMetrics() {
      const endpoint = buildEndpoint();

      try {
        const result = await window.DataLayer.fetchWithCache(endpoint, {
          key: 'wormhole-svg:' + endpoint,
          ttlMs: metrics.ttlMs,
          staleMs: metrics.staleMs,
          timeoutMs: 3500
        });

        const data = result.data || {};
        metrics.activity = normalizeMetric(data.activity);
        metrics.matchedRoutes = Math.max(0, Number(data.matchedRoutes) || 0);
        metrics.inFlow = normalizeMetric(data.inFlow);
        metrics.outFlow = normalizeMetric(data.outFlow);
        metrics.depositCount = Math.max(0, Number(data.depositCount) || 0);
        metrics.withdrawCount = Math.max(0, Number(data.withdrawCount) || 0);
        metrics.uniqueUsers = Math.max(0, Number(data.uniqueUsers) || 0);
        metrics.samples = Math.max(0, Number(data.samples) || 0);
        metrics.bridgeConfigured = !!data.bridgeConfigured;
        metrics.selectedBridges = Array.isArray(data.selectedBridges) ? data.selectedBridges : appliedAddresses;
        metrics.windowBlocks = Math.max(0, Number(data.windowBlocks) || 0);
        metrics.source = String(data.source || 'unknown');
        metrics.isStale = !!result.isStale;
        metrics.lastUpdated = new Date().toISOString();
      } catch (_error) {
        metrics.isStale = true;
      }

      applyShellUi();
      renderScene();
      refreshSelectionUi();
    }

    presetWrap.addEventListener('click', function (event) {
      const btn = event.target.closest('button[data-address]');
      if (!btn) return;
      addAddress(btn.dataset.address);
    });

    addBtn.addEventListener('click', function () {
      addAddress(customInput.value);
    });

    customInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addAddress(customInput.value);
      }
    });

    resetBtn.addEventListener('click', function () {
      workingAddresses = [];
      refreshSelectionUi();
    });

    applyBtn.addEventListener('click', function () {
      appliedAddresses = workingAddresses.slice();
      setAddressesToUrl(appliedAddresses);
      applyStatus.textContent = 'Applied. One-shot update only (safe mode).';
      pollMetrics();
    });

    refreshSelectionUi();
    applyShellUi();
    renderScene();

    document.addEventListener('visibilitychange', function () {
      // safe mode: no automatic polling while testing bridge mode stability
    });

    window.addEventListener('beforeunload', function () {
      // safe mode: nothing to clean up for polling
    });
  }

  window.WormholeDemo = { bootstrap: bootstrap };
})();
