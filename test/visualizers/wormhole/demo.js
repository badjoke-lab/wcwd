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

  function asRatioText(value) {
    return Math.round(normalizeMetric(value) * 100) + '%';
  }

  function bootstrapWormhole(shellController) {
    const root = document.querySelector('[data-visualizer-content]');
    if (!root || !window.VizCanvas || !window.PerfGovernor || !window.DataLayer) return;

    const canvasHost = document.createElement('div');
    canvasHost.className = 'wormhole-canvas-host';

    root.innerHTML = '';
    root.append(canvasHost);

    const isLite = window.VisualizerShell && window.VisualizerShell.isLite ? window.VisualizerShell.isLite() : false;
    const governor = window.PerfGovernor.create({
      isLite: isLite,
      maxFps: 60,
      maxParticles: 520,
      liteMaxFps: 30,
      liteParticleRatio: 0.25
    });

    let particles = [];
    let state = 'ok';
    const metrics = {
      inFlow: 0.35,
      outFlow: 0.35,
      whalesIn: 0,
      whalesOut: 0,
      samples: 0,
      isStale: false,
      lastUpdated: null,
      ttlMs: 2500,
      staleMs: 25000,
      fps: 0,
      lite: isLite
    };

    function applyShellUi() {
      if (!shellController) return;

      shellController.setMiniStats({
        items: [
          { label: 'In', value: asRatioText(metrics.inFlow) },
          { label: 'Out', value: asRatioText(metrics.outFlow) },
          { label: 'Whale In / Out', value: metrics.whalesIn + ' / ' + metrics.whalesOut },
          { label: 'Samples', value: String(metrics.samples), sub: metrics.lastUpdated ? 'Updated' : 'Waiting' }
        ]
      });

      shellController.setLegend({
        items: [
          { kind: 'dot', tone: 'thin', label: 'Small move' },
          { kind: 'dot', tone: 'thick', label: 'Whale move' },
          { kind: 'line', tone: 'in', label: 'In (absorb)' },
          { kind: 'line', tone: 'out', label: 'Out (emit)' }
        ]
      });

      shellController.setHint('吸い込み＝流入 / 噴出＝流出。太いほど大口。');

      if (state === 'error') {
        shellController.setState({
          kind: 'error',
          message: 'Data fetch failed. Visual paused until the next successful poll.'
        });
      } else if (metrics.isStale) {
        shellController.setState({
          kind: 'stale',
          message: 'Running on last successful snapshot while reconnecting.'
        });
      } else if (metrics.samples === 0) {
        shellController.setState({
          kind: 'empty',
          message: 'Fetched successfully, but there are no events in this window.'
        });
      } else {
        shellController.setState({ kind: 'ok', message: 'Streaming updates.' });
      }

      shellController.setDebugData({
        lastUpdated: metrics.lastUpdated,
        isStale: metrics.isStale,
        ttlMs: metrics.ttlMs,
        staleMs: metrics.staleMs,
        samples: metrics.samples,
        lite: metrics.lite,
        fps: Math.round(metrics.fps)
      });
    }

    async function pollMetrics() {
      const lite = governor.isLite;
      const endpoint = '/api/viz/wormhole?lite=' + (lite ? '1' : '0');
      try {
        const result = await window.DataLayer.fetchWithCache(endpoint, {
          key: 'wormhole:' + (lite ? 'lite' : 'full'),
          ttlMs: metrics.ttlMs,
          staleMs: metrics.staleMs,
          timeoutMs: 3500
        });

        metrics.inFlow = normalizeMetric(result.data.inFlow);
        metrics.outFlow = normalizeMetric(result.data.outFlow);
        metrics.whalesIn = Math.max(0, Number(result.data.whalesIn) || 0);
        metrics.whalesOut = Math.max(0, Number(result.data.whalesOut) || 0);
        metrics.samples = Math.max(0, Number(result.data.samples) || 0);
        metrics.isStale = !!result.isStale;
        metrics.lastUpdated = new Date().toISOString();
        state = 'ok';
      } catch (_error) {
        metrics.isStale = false;
        state = 'error';
      }

      applyShellUi();
    }

    pollMetrics();
    const pollHandle = window.setInterval(pollMetrics, 4000);

    const viz = window.VizCanvas.create({
      container: canvasHost,
      isLite: isLite,
      perfGovernor: governor,
      background: 'transparent',
      onFrame: function (ctx, frameState) {
        metrics.fps = frameState.fps;
        metrics.lite = frameState.isLite;

        if (state === 'error') {
          ctx.fillStyle = 'rgba(30, 30, 30, 0.06)';
          ctx.fillRect(0, 0, frameState.width, frameState.height);
          return;
        }

        const flowBalance = normalizeMetric(metrics.inFlow + metrics.outFlow);
        const whalePressure = Math.min(1, (metrics.whalesIn + metrics.whalesOut) / 18);
        const dynamicRatio = 0.2 + flowBalance * 0.7;
        const desiredCount = Math.max(24, Math.floor(governor.getMaxParticles() * dynamicRatio));

        if (particles.length !== desiredCount) {
          const speedBoost = 1 + whalePressure * 0.9;
          particles = createParticles(desiredCount, frameState.width, frameState.height, speedBoost);
        }

        const centerX = frameState.width * 0.5;
        const centerY = frameState.height * 0.5;
        const speedScale = Math.max(0.5, frameState.delta / 16);
        const sinkStrength = 0.55 + metrics.inFlow * 0.9;
        const emitStrength = 0.35 + metrics.outFlow * 0.7;

        ctx.fillStyle = 'rgba(10, 10, 15, 0.16)';
        ctx.fillRect(0, 0, frameState.width, frameState.height);

        const tunnelWidth = 8 + flowBalance * 18;
        ctx.beginPath();
        ctx.strokeStyle = metrics.isStale ? 'rgba(100, 100, 100, 0.38)' : 'rgba(80, 80, 140, 0.4)';
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

          const inside = governor.isInsideBounds(particle, { width: frameState.width, height: frameState.height }, 24);
          if (!inside) continue;

          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist < 9) {
            particles[i] = randomParticle(frameState.width, frameState.height, emitStrength);
            continue;
          }

          ctx.beginPath();
          ctx.fillStyle = metrics.isStale
            ? 'rgba(95, 95, 95, ' + particle.alpha.toFixed(2) + ')'
            : 'rgba(30, 30, 45, ' + particle.alpha.toFixed(2) + ')';
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      onUnmount: function () {
        window.clearInterval(pollHandle);
      }
    });

    viz.mount();

    if (window.VisualizerShell && window.VisualizerShell.onLiteChange) {
      window.VisualizerShell.onLiteChange(function (nextLite) {
        viz.setLite(nextLite);
        metrics.lite = nextLite;
        pollMetrics();
      });
    }
  }

  window.WormholeDemo = { bootstrap: bootstrapWormhole };
})();
