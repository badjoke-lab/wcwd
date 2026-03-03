(function () {
  function randomParticle(width, height, speedBoost) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(width, height) * (0.35 + Math.random() * 0.55);

    return {
      x: width * 0.5 + Math.cos(angle) * radius,
      y: height * 0.5 + Math.sin(angle) * radius,
      size: 1 + Math.random() * 2,
      speed: (0.02 + Math.random() * 0.04) * speedBoost,
      alpha: 0.25 + Math.random() * 0.6
    };
  }

  function createParticles(count, width, height, speedBoost) {
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push(randomParticle(width, height, speedBoost));
    }
    return particles;
  }

  function normalizeMetric(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric));
  }

  function bootstrapWormhole() {
    const root = document.querySelector('[data-visualizer-content]');
    if (!root || !window.VizCanvas || !window.PerfGovernor || !window.DataLayer) return;

    const canvasHost = document.createElement('div');
    canvasHost.className = 'wormhole-canvas-host';

    const statusLine = document.createElement('div');
    statusLine.className = 'wormhole-status';

    const emptyState = document.createElement('p');
    emptyState.className = 'wormhole-empty';
    emptyState.textContent = 'data unavailable';
    emptyState.hidden = true;

    const debugPanel = document.createElement('div');
    debugPanel.className = 'wormhole-debug';

    root.innerHTML = '';
    root.append(canvasHost, statusLine, emptyState, debugPanel);

    const isLite = window.VisualizerShell && window.VisualizerShell.isLite ? window.VisualizerShell.isLite() : false;
    const governor = window.PerfGovernor.create({
      isLite: isLite,
      maxFps: 60,
      maxParticles: 520,
      liteMaxFps: 30,
      liteParticleRatio: 0.25
    });

    let particles = [];
    let hasData = false;
    const metrics = { inFlow: 0.35, outFlow: 0.35, whalesIn: 0, whalesOut: 0, samples: 0, isStale: false };

    async function pollMetrics() {
      const lite = governor.isLite;
      const endpoint = '/api/viz/wormhole?lite=' + (lite ? '1' : '0');
      try {
        const result = await window.DataLayer.fetchWithCache(endpoint, {
          key: 'wormhole:' + (lite ? 'lite' : 'full'),
          ttlMs: 2500,
          staleMs: 25000,
          timeoutMs: 3500
        });

        hasData = true;
        metrics.inFlow = normalizeMetric(result.data.inFlow);
        metrics.outFlow = normalizeMetric(result.data.outFlow);
        metrics.whalesIn = Math.max(0, Number(result.data.whalesIn) || 0);
        metrics.whalesOut = Math.max(0, Number(result.data.whalesOut) || 0);
        metrics.samples = Math.max(0, Number(result.data.samples) || 0);
        metrics.isStale = !!result.isStale;

        statusLine.textContent = metrics.isStale ? 'stale' : '';
        statusLine.dataset.mode = metrics.isStale ? 'stale' : 'fresh';
        statusLine.hidden = !metrics.isStale;
        emptyState.hidden = true;
      } catch (_error) {
        hasData = false;
        statusLine.hidden = true;
        emptyState.hidden = false;
      }
    }

    pollMetrics();
    const pollHandle = window.setInterval(pollMetrics, 4000);

    const viz = window.VizCanvas.create({
      container: canvasHost,
      isLite: isLite,
      perfGovernor: governor,
      background: 'transparent',
      onFrame: function (ctx, state) {
        const flowBalance = normalizeMetric(metrics.inFlow + metrics.outFlow);
        const whalePressure = Math.min(1, (metrics.whalesIn + metrics.whalesOut) / 18);
        const dynamicRatio = hasData ? (0.2 + flowBalance * 0.7) : 0.12;
        const desiredCount = Math.max(24, Math.floor(governor.getMaxParticles() * dynamicRatio));

        if (particles.length !== desiredCount) {
          const speedBoost = 1 + whalePressure * 0.9;
          particles = createParticles(desiredCount, state.width, state.height, speedBoost);
        }

        const centerX = state.width * 0.5;
        const centerY = state.height * 0.5;
        const speedScale = Math.max(0.5, state.delta / 16);
        const sinkStrength = 0.55 + metrics.inFlow * 0.9;
        const emitStrength = 0.35 + metrics.outFlow * 0.7;

        ctx.fillStyle = 'rgba(10, 10, 15, 0.16)';
        ctx.fillRect(0, 0, state.width, state.height);

        const tunnelWidth = 8 + flowBalance * 18;
        ctx.beginPath();
        ctx.strokeStyle = hasData ? 'rgba(80, 80, 140, 0.4)' : 'rgba(120, 120, 120, 0.24)';
        ctx.lineWidth = tunnelWidth;
        ctx.arc(centerX, centerY, Math.max(12, tunnelWidth * 0.9), 0, Math.PI * 2);
        ctx.stroke();

        const drawCandidates = governor.capParticles(particles) || [];

        for (let i = 0; i < drawCandidates.length; i += 1) {
          const particle = drawCandidates[i];
          const distX = centerX - particle.x;
          const distY = centerY - particle.y;

          particle.x += distX * particle.speed * speedScale * sinkStrength;
          particle.y += distY * particle.speed * speedScale * sinkStrength;

          const inside = governor.isInsideBounds(particle, { width: state.width, height: state.height }, 24);
          if (!inside) continue;

          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist < 9) {
            particles[i] = randomParticle(state.width, state.height, emitStrength);
            continue;
          }

          ctx.beginPath();
          ctx.fillStyle = hasData
            ? 'rgba(30, 30, 45, ' + particle.alpha.toFixed(2) + ')'
            : 'rgba(90, 90, 90, ' + particle.alpha.toFixed(2) + ')';
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }

        debugPanel.textContent =
          'fps: ' + Math.round(state.fps) +
          ' / particles: ' + drawCandidates.length +
          ' / in: ' + metrics.inFlow.toFixed(2) +
          ' / out: ' + metrics.outFlow.toFixed(2) +
          ' / whales: ' + (metrics.whalesIn + metrics.whalesOut) +
          ' / samples: ' + metrics.samples +
          ' / lite: ' + (state.isLite ? 'ON' : 'OFF');
      },
      onUnmount: function () {
        window.clearInterval(pollHandle);
      }
    });

    viz.mount();

    if (window.VisualizerShell && window.VisualizerShell.onLiteChange) {
      window.VisualizerShell.onLiteChange(function (nextLite) {
        viz.setLite(nextLite);
        pollMetrics();
      });
    }
  }

  window.WormholeDemo = { bootstrap: bootstrapWormhole };
})();
