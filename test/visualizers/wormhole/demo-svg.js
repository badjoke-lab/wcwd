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
    return uniq(q.split(',').map(normalizeAddress).filter(Boolean));
  }

  function setAddressesToUrl(addresses) {
    const url = new URL(window.location.href);
    const next = uniq((addresses || []).map(normalizeAddress).filter(Boolean));
    if (next.length) url.searchParams.set('addresses', next.join(','));
    else url.searchParams.delete('addresses');
    window.history.replaceState({}, '', url);
  }

  function stateLabel(state) {
    const s = String(state || '').toLowerCase();
    if (s === 'fresh') return 'Fresh';
    if (s === 'delayed') return 'Delayed';
    if (s === 'stale') return 'Stale';
    if (s === 'degraded') return 'Degraded';
    if (s === 'unavailable') return 'Unavailable';
    return 'Unknown';
  }

  function stateKind(state, stale) {
    const s = String(state || '').toLowerCase();
    if (stale || s === 'stale' || s === 'delayed') return 'stale';
    if (s === 'unavailable') return 'error';
    if (s === 'degraded') return 'warn';
    return 'ok';
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
      'aria-label': 'World Chain bridge activity visualization'
    });

    const bg = el('rect', { x: 0, y: 0, width: 1000, height: 560, fill: 'rgba(248,248,249,0.95)' });
    const grid = el('g', { opacity: '0.65' });
    for (let x = 0; x <= 1000; x += 40) grid.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: 560, stroke: 'rgba(20,20,20,0.05)', 'stroke-width': 1 }));
    for (let y = 0; y <= 560; y += 40) grid.appendChild(el('line', { x1: 0, y1: y, x2: 1000, y2: y, stroke: 'rgba(20,20,20,0.05)', 'stroke-width': 1 }));

    const labels = el('g', {});
    const modeLabel = el('text', { x: 32, y: 44, 'font-size': 18, 'font-weight': 700, fill: 'rgba(20,20,20,0.84)' });
    const subLabel = el('text', { x: 32, y: 72, 'font-size': 14, fill: 'rgba(20,20,20,0.58)' });
    const guideLeft = el('text', { x: 72, y: 510, 'font-size': 13, fill: 'rgba(20,20,20,0.45)' });
    guideLeft.textContent = 'Recent activity';
    const guideCenter = el('text', { x: 470, y: 510, 'font-size': 13, fill: 'rgba(20,20,20,0.45)' });
    guideCenter.textContent = 'Bridge hub';
    labels.append(modeLabel, subLabel, guideLeft, guideCenter);

    const centerGroup = el('g', {});
    const centerCore = el('circle', { cx: 500, cy: 280, r: 24, fill: 'rgba(20,20,20,0.08)' });
    const centerRing = el('circle', { cx: 500, cy: 280, r: 58, fill: 'none', stroke: 'rgba(20,20,20,0.18)', 'stroke-width': 2 });
    centerGroup.append(centerCore, centerRing);

    const activityLayer = el('g', {});
    const inLayer = el('g', {});
    const outLayer = el('g', {});
    const accentLayer = el('g', {});

    svg.append(bg, grid, activityLayer, accentLayer, inLayer, outLayer, centerGroup, labels);
    wrap.appendChild(svg);
    host.appendChild(wrap);

    return { modeLabel, subLabel, centerCore, centerRing, activityLayer, inLayer, outLayer, accentLayer };
  }

  function clearLayer(layer) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function clearScene(scene) {
    clearLayer(scene.activityLayer);
    clearLayer(scene.inLayer);
    clearLayer(scene.outLayer);
    clearLayer(scene.accentLayer);
  }

  function renderUnavailable(scene, metrics) {
    clearScene(scene);
    scene.modeLabel.textContent = 'Unavailable';
    scene.subLabel.textContent = metrics.lastError || 'Visualizer data is not available.';
    scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.04)');
    scene.centerRing.setAttribute('r', '46');
    scene.centerRing.setAttribute('stroke', 'rgba(20,20,20,0.12)');
    scene.centerRing.setAttribute('stroke-width', '1.5');
  }

  function renderActivityOnly(scene, metrics) {
    clearScene(scene);
    scene.modeLabel.textContent = 'Activity only';
    scene.subLabel.textContent = 'No bridge addresses applied.';

    const activity = normalizeMetric(metrics.activity);
    const ringR = 44 + activity * 24;
    scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.05)');
    scene.centerRing.setAttribute('r', String(ringR));
    scene.centerRing.setAttribute('stroke', metrics.isStale ? 'rgba(20,20,20,0.20)' : 'rgba(20,20,20,0.12)');
    scene.centerRing.setAttribute('stroke-width', String(1.5 + activity * 1.2));

    const count = 12 + Math.round(activity * 16);
    for (let i = 0; i < count; i += 1) {
      const y = 110 + (i % 9) * 38 + ((i * 17) % 11);
      const x = 60 + ((i * 67 + Date.now() / 80) % 860);
      const r = 2 + ((i * 3) % 3) + activity * 1.5;
      scene.activityLayer.appendChild(el('circle', { cx: x, cy: y, r: r.toFixed(1), fill: 'rgba(20,20,20,0.34)' }));
    }

    scene.accentLayer.appendChild(el('path', {
      d: 'M 70 280 C 220 240, 350 320, 500 280 C 650 240, 780 320, 930 280',
      fill: 'none',
      stroke: 'rgba(20,20,20,0.16)',
      'stroke-width': 2.5 + activity * 2
    }));
  }

  function renderBridgeEmpty(scene, metrics) {
    clearScene(scene);
    scene.modeLabel.textContent = 'Bridge selected';
    scene.subLabel.textContent = 'No matching bridge activity in the current window.';
    scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.08)');
    scene.centerRing.setAttribute('r', '60');
    scene.centerRing.setAttribute('stroke', 'rgba(20,20,20,0.18)');
    scene.centerRing.setAttribute('stroke-width', '2');
  }

  function renderBridgeActive(scene, metrics) {
    clearScene(scene);
    const inFlow = normalizeMetric(metrics.inFlow);
    const outFlow = normalizeMetric(metrics.outFlow);
    const activity = normalizeMetric(metrics.activity || Math.max(inFlow, outFlow));

    scene.modeLabel.textContent = 'Bridge activity';
    scene.subLabel.textContent = formatCount(metrics.matchedRoutes) + ' matched route(s) · ' + formatCount(metrics.samples) + ' sample(s)';
    scene.centerCore.setAttribute('fill', 'rgba(20,20,20,0.10)');
    scene.centerRing.setAttribute('r', String(62 + (inFlow + outFlow + activity) * 10));
    scene.centerRing.setAttribute('stroke', metrics.isStale ? 'rgba(20,20,20,0.30)' : 'rgba(20,20,20,0.22)');
    scene.centerRing.setAttribute('stroke-width', String(2 + activity * 2));

    const inWidth = 2 + inFlow * 10;
    const outWidth = 2 + outFlow * 10;
    scene.inLayer.appendChild(el('path', {
      d: 'M 90 250 C 240 190, 360 220, 500 280',
      fill: 'none',
      stroke: 'rgba(20,20,20,0.34)',
      'stroke-width': inWidth,
      'stroke-linecap': 'round'
    }));
    scene.outLayer.appendChild(el('path', {
      d: 'M 500 280 C 640 340, 760 370, 910 310',
      fill: 'none',
      stroke: 'rgba(20,20,20,0.22)',
      'stroke-width': outWidth,
      'stroke-linecap': 'round'
    }));

    const dots = Math.max(4, Math.min(24, Math.round(metrics.matchedRoutes || metrics.samples || 6)));
    for (let i = 0; i < dots; i += 1) {
      const angle = (Math.PI * 2 * i) / dots;
      const radius = 72 + ((i % 4) * 12);
      scene.accentLayer.appendChild(el('circle', {
        cx: 500 + Math.cos(angle) * radius,
        cy: 280 + Math.sin(angle) * radius * 0.62,
        r: 2.5 + activity * 2,
        fill: 'rgba(20,20,20,0.28)'
      }));
    }
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

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn';
    resetBtn.textContent = 'Reset';

    selectedHeader.append(selectedTitle, resetBtn);
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

    const metrics = {
      activity: 0,
      matchedRoutes: 0,
      inFlow: 0,
      outFlow: 0,
      depositCount: 0,
      withdrawCount: 0,
      uniqueUsers: 0,
      samples: 0,
      bridgeConfigured: appliedAddresses.length > 0,
      selectedBridges: appliedAddresses.slice(),
      state: 'unknown',
      isStale: false,
      source: 'n/a',
      windowBlocks: 0,
      lastUpdated: null,
      lastError: '',
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
      if (dirty) applyStatus.textContent = 'Pending changes. Apply to update visualization.';
      else if (metrics.lastUpdated) applyStatus.textContent = 'Watching ' + appliedAddresses.length + ' address(es). Updated just now.';
      else applyStatus.textContent = 'No changes yet.';
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
      if (!workingAddresses.includes(normalized)) workingAddresses = workingAddresses.concat([normalized]);
      customInput.value = '';
      refreshSelectionUi();
    }

    function buildEndpoint() {
      const params = new URLSearchParams();
      params.set('lite', '0');
      if (appliedAddresses.length) params.set('addresses', appliedAddresses.join(','));
      return '/api/viz/wormhole?' + params.toString();
    }

    function applyShellUi() {
      if (!shellController) return;
      const selected = appliedAddresses.length > 0;
      const mode = selected ? 'Bridge selected' : 'Activity only';
      const status = stateLabel(metrics.state) + (metrics.isStale ? ' / cache' : '');

      shellController.setMiniStats({
        items: [
          { label: 'Mode', value: mode, sub: selected ? 'address filter applied' : 'no address filter' },
          { label: 'State', value: status, sub: metrics.source || 'source unknown' },
          { label: 'Matched', value: formatCount(metrics.matchedRoutes), sub: 'Routes' },
          { label: 'Blocks', value: formatCount(metrics.windowBlocks), sub: 'Recent window' }
        ]
      });

      shellController.setLegend({
        items: [
          { kind: 'dot', tone: 'thin', label: 'Recent activity' },
          { kind: 'line', tone: 'thin', label: 'Bridge in / out flow' },
          { kind: 'dot', tone: 'thin', label: 'Matched route samples' }
        ]
      });

      shellController.setHint(selected
        ? 'Bridge mode: selected addresses shape the flow. Empty results mean no matching activity in the current window.'
        : 'Activity-only mode: apply one or more bridge addresses to focus the flow.');

      shellController.setState({
        kind: stateKind(metrics.state, metrics.isStale),
        message: selected
          ? stateLabel(metrics.state) + ': bridge filter applied to ' + appliedAddresses.length + ' address(es).'
          : stateLabel(metrics.state) + ': showing recent activity without a bridge filter.'
      });
    }

    function renderScene() {
      if (metrics.state === 'unavailable') {
        renderUnavailable(scene, metrics);
      } else if (!appliedAddresses.length) {
        renderActivityOnly(scene, metrics);
      } else if (metrics.matchedRoutes <= 0 && metrics.samples <= 0) {
        renderBridgeEmpty(scene, metrics);
      } else {
        renderBridgeActive(scene, metrics);
      }
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
        const dataMetrics = data.metrics || data;
        metrics.activity = normalizeMetric(dataMetrics.activity);
        metrics.matchedRoutes = Math.max(0, Number(dataMetrics.matchedRoutes) || 0);
        metrics.inFlow = normalizeMetric(dataMetrics.inFlow);
        metrics.outFlow = normalizeMetric(dataMetrics.outFlow);
        metrics.depositCount = Math.max(0, Number(dataMetrics.depositCount) || 0);
        metrics.withdrawCount = Math.max(0, Number(dataMetrics.withdrawCount) || 0);
        metrics.uniqueUsers = Math.max(0, Number(dataMetrics.uniqueUsers) || 0);
        metrics.samples = Math.max(0, Number(dataMetrics.samples) || 0);
        metrics.bridgeConfigured = !!(data.selection?.configured ?? data.bridgeConfigured);
        metrics.selectedBridges = Array.isArray(data.selection?.addresses) ? data.selection.addresses : (Array.isArray(data.selectedBridges) ? data.selectedBridges : appliedAddresses);
        metrics.windowBlocks = Math.max(0, Number(data.window?.blocks ?? data.windowBlocks) || 0);
        metrics.source = String(data.source || 'unknown');
        metrics.state = String(data.state || (data.ok === false ? 'degraded' : 'fresh'));
        metrics.isStale = !!result.isStale || metrics.state === 'stale' || metrics.state === 'delayed';
        metrics.lastError = Array.isArray(data.notes) && data.notes.length ? data.notes.join(' · ') : '';
        metrics.lastUpdated = new Date().toISOString();
      } catch (error) {
        metrics.state = 'unavailable';
        metrics.isStale = true;
        metrics.lastError = error instanceof Error ? error.message : String(error);
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

    addBtn.addEventListener('click', function () { addAddress(customInput.value); });
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
      applyStatus.textContent = 'Applied. Updating visualization.';
      pollMetrics();
    });

    refreshSelectionUi();
    applyShellUi();
    renderScene();
    pollMetrics();
  }

  window.WormholeDemo = { bootstrap: bootstrap };
})();
