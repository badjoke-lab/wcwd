(function () {
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

  function randomParticle(width, height, speedBoost, outBias) {
    const mode = Math.random() < outBias ? 'out' : 'in';
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(width, height) * (0.35 + Math.random() * 0.55);

    const particle = {
      x: 0,
      y: 0,
      trailX: 0,
      trailY: 0,
      size: 1 + Math.random() * 2,
      speed: (0.018 + Math.random() * 0.04) * speedBoost,
      alpha: 0.2 + Math.random() * 0.65,
      mode: mode,
      angle: angle,
      swirl: (Math.random() - 0.5) * 0.0015
    };

    if (mode === 'in') {
      particle.x = centerX + Math.cos(angle) * radius;
      particle.y = centerY + Math.sin(angle) * radius;
    } else {
      const startRadius = 5 + Math.random() * 18;
      particle.x = centerX + Math.cos(angle) * startRadius;
      particle.y = centerY + Math.sin(angle) * startRadius;
      particle.size = Math.max(1, particle.size - 0.3);
    }

    particle.trailX = particle.x;
    particle.trailY = particle.y;
    return particle;
  }

  function createParticles(count, width, height, speedBoost, outBias) {
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push(randomParticle(width, height, speedBoost, outBias));
    }
    return particles;
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
      maxParticles: 540,
      liteMaxFps: 30,
      liteParticleRatio: 0.18
    });

    let particles = [];
    let state = 'ok';
    let adaptiveParticleFactor = 1;
    let lowFpsMs = 0;
    let recoverFpsMs = 0;
    const pulseState = {
      inPulse: 0,
      outPulse: 0,
      inPulseAt: 0,
      outPulseAt: 0,
      cooldownMs: 1400
    };

    const metrics = {
      inFlow: 0.35,
      outFlow: 0.35,
      whalesIn: 0,
      whalesOut: 0,
      samples: 0,
      windowSec: 0,
      source: 'n/a',
      isStale: false,
      lastUpdated: null,
      ttlMs: 2500,
      staleMs: 25000,
      fps: 0,
      lite: isLite
    };

    function maybeTriggerPulse(kind, intensity) {
      const now = Date.now();
      if (kind === 'in') {
        if (now - pulseState.inPulseAt < pulseState.cooldownMs) return;
        pulseState.inPulseAt = now;
        pulseState.inPulse = Math.min(1, pulseState.inPulse + Math.max(0.35, intensity));
        return;
      }
      if (now - pulseState.outPulseAt < pulseState.cooldownMs) return;
      pulseState.outPulseAt = now;
      pulseState.outPulse = Math.min(1, pulseState.outPulse + Math.max(0.35, intensity));
    }

    function applyShellUi() {
      if (!shellController) return;
      const staleSub = metrics.isStale ? 'stale' : '';

      shellController.setMiniStats({
        items: [
          { label: 'In', value: asRatioText(metrics.inFlow), sub: 'Share' },
          { label: 'Out', value: asRatioText(metrics.outFlow), sub: 'Share' },
          { label: 'Whales', value: formatCount(metrics.whalesIn + metrics.whalesOut), sub: 'Events' },
          { label: 'Samples', value: formatCount(metrics.samples), sub: (metrics.windowSec ? ('Window ' + metrics.windowSec + 's') : 'Waiting') + (staleSub ? ' · stale' : '') },
          { label: 'Source', value: metrics.source, sub: metrics.lastUpdated ? 'Updated' : 'Waiting' }
        ]
      });

      shellController.setLegend({
        items: [
          { kind: 'dot', tone: 'thin', label: 'IN flow (absorbed dots)' },
          { kind: 'line', tone: 'out', label: 'OUT flow (emitted streaks)' },
          { kind: 'dot', tone: 'thick', label: 'Thicker mark = larger move' }
        ]
      });

      shellController.setHint('Dots pulled to center = IN, streaks pushed out = OUT.\nBased on free-tier sampling, so values are approximate snapshots.');

      if (state === 'error') {
        shellController.setState({
          kind: 'error',
          message: 'Fetch failed. Showing a calm standby view; retrying automatically.'
        });
      } else if (metrics.isStale) {
        shellController.setState({
          kind: 'stale',
          message: 'Showing last snapshot while reconnecting.'
        });
      } else if (metrics.samples === 0) {
        shellController.setState({
          kind: 'empty',
          message: 'No sampled events in this window yet.'
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
        fps: Math.round(metrics.fps),
        adaptiveParticleFactor: Number(adaptiveParticleFactor.toFixed(2))
      });
    }

    async function pollMetrics() {
      const lite = governor.isLite;
      const endpoint = '/api/viz/wormhole?lite=' + (lite ? '1' : '0');
      const prevWhalesIn = metrics.whalesIn;
      const prevWhalesOut = metrics.whalesOut;

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
        metrics.windowSec = Math.max(0, Number(result.data.windowSec) || 0);
        metrics.source = String(result.data.source || 'unknown');
        metrics.isStale = !!result.isStale;
        metrics.lastUpdated = new Date().toISOString();
        state = 'ok';

        const whaleInDelta = Math.max(0, metrics.whalesIn - prevWhalesIn);
        const whaleOutDelta = Math.max(0, metrics.whalesOut - prevWhalesOut);
        if (!metrics.isStale && !governor.isLite && whaleInDelta > 0) {
          maybeTriggerPulse('in', Math.min(1, whaleInDelta / 3));
        }
        if (!metrics.isStale && !governor.isLite && whaleOutDelta > 0) {
          maybeTriggerPulse('out', Math.min(1, whaleOutDelta / 3));
        }
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

        const speedScale = Math.max(0.4, frameState.delta / 16);
        if (frameState.fps < 24) {
          lowFpsMs += frameState.delta;
          recoverFpsMs = 0;
        } else if (frameState.fps > 45) {
          recoverFpsMs += frameState.delta;
          lowFpsMs = Math.max(0, lowFpsMs - frameState.delta * 0.5);
        }

        if (!frameState.isLite && lowFpsMs > 2400 && adaptiveParticleFactor > 0.52) {
          adaptiveParticleFactor = Math.max(0.52, adaptiveParticleFactor - 0.1);
          lowFpsMs = 0;
        }

        if (!frameState.isLite && recoverFpsMs > 5000 && adaptiveParticleFactor < 1) {
          adaptiveParticleFactor = Math.min(1, adaptiveParticleFactor + 0.08);
          recoverFpsMs = 0;
        }

        const centerX = frameState.width * 0.5;
        const centerY = frameState.height * 0.5;

        ctx.fillStyle = 'rgba(248, 248, 249, 0.95)';
        ctx.fillRect(0, 0, frameState.width, frameState.height);

        const gridStep = frameState.isLite ? 28 : 22;
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.045)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= frameState.width; gx += gridStep) {
          ctx.beginPath();
          ctx.moveTo(gx + 0.5, 0);
          ctx.lineTo(gx + 0.5, frameState.height);
          ctx.stroke();
        }
        for (let gy = 0; gy <= frameState.height; gy += gridStep) {
          ctx.beginPath();
          ctx.moveTo(0, gy + 0.5);
          ctx.lineTo(frameState.width, gy + 0.5);
          ctx.stroke();
        }

        if (state === 'error') {
          ctx.fillStyle = 'rgba(12, 12, 12, 0.06)';
          ctx.fillRect(0, 0, frameState.width, frameState.height);
          return;
        }

        const flowBalance = normalizeMetric(metrics.inFlow + metrics.outFlow);
        const outBias = metrics.outFlow / Math.max(0.001, metrics.inFlow + metrics.outFlow);
        const whalePressure = Math.min(1, (metrics.whalesIn + metrics.whalesOut) / 14);
        const dynamicRatio = 0.2 + flowBalance * 0.7;
        const desiredCount = Math.max(20, Math.floor(governor.getMaxParticles() * dynamicRatio * adaptiveParticleFactor));

        if (particles.length !== desiredCount) {
          const speedBoost = 1 + whalePressure * 0.8;
          particles = createParticles(desiredCount, frameState.width, frameState.height, speedBoost, outBias);
        }

        const sinkStrength = 0.5 + metrics.inFlow * 1.1;
        const emitStrength = 0.45 + metrics.outFlow * 1.0;
        const tunnelWidth = 8 + flowBalance * 18 + whalePressure * 8;

        ctx.beginPath();
        ctx.strokeStyle = metrics.isStale ? 'rgba(120,120,120,0.4)' : 'rgba(40, 40, 40, 0.45)';
        ctx.lineWidth = tunnelWidth;
        ctx.arc(centerX, centerY, Math.max(12, tunnelWidth * 0.9), 0, Math.PI * 2);
        ctx.stroke();

        if (!frameState.isLite) {
          pulseState.inPulse = Math.max(0, pulseState.inPulse - frameState.delta * 0.0018);
          pulseState.outPulse = Math.max(0, pulseState.outPulse - frameState.delta * 0.0018);

          if (pulseState.inPulse > 0.01) {
            const pull = pulseState.inPulse;
            const ringRadius = 70 - pull * 46;
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(20,20,20,' + (0.1 + pull * 0.35).toFixed(3) + ')';
            ctx.lineWidth = 1.5 + pull * 4;
            ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
          }

          if (pulseState.outPulse > 0.01) {
            const burst = pulseState.outPulse;
            const ringRadius = 24 + (1 - burst) * 80;
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(10,10,10,' + (0.08 + burst * 0.34).toFixed(3) + ')';
            ctx.lineWidth = 1.2 + burst * 5;
            ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        const drawCandidates = governor.capParticles(particles) || [];

        for (let i = 0; i < drawCandidates.length; i += 1) {
          const particle = drawCandidates[i];
          particle.trailX = particle.x;
          particle.trailY = particle.y;
          particle.angle += particle.swirl * frameState.delta;

          if (particle.mode === 'in') {
            const distX = centerX - particle.x;
            const distY = centerY - particle.y;
            particle.x += distX * particle.speed * speedScale * sinkStrength;
            particle.y += distY * particle.speed * speedScale * sinkStrength;

            const dist = Math.sqrt(distX * distX + distY * distY);
            if (dist < 9) {
              particles[i] = randomParticle(frameState.width, frameState.height, emitStrength, outBias);
              continue;
            }

            if (!governor.isInsideBounds(particle, { width: frameState.width, height: frameState.height }, 24)) {
              particles[i] = randomParticle(frameState.width, frameState.height, emitStrength, outBias);
              continue;
            }

            ctx.beginPath();
            ctx.fillStyle = metrics.isStale
              ? 'rgba(110,110,110,' + particle.alpha.toFixed(2) + ')'
              : 'rgba(20,20,20,' + particle.alpha.toFixed(2) + ')';
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }

          const push = particle.speed * speedScale * emitStrength * (12 + metrics.outFlow * 12);
          particle.x += Math.cos(particle.angle) * push;
          particle.y += Math.sin(particle.angle) * push;

          if (!governor.isInsideBounds(particle, { width: frameState.width, height: frameState.height }, 28)) {
            particles[i] = randomParticle(frameState.width, frameState.height, emitStrength, outBias);
            continue;
          }

          const lineAlpha = Math.max(0.16, particle.alpha * 0.72);
          ctx.beginPath();
          ctx.strokeStyle = metrics.isStale
            ? 'rgba(120,120,120,' + lineAlpha.toFixed(2) + ')'
            : 'rgba(55,55,55,' + lineAlpha.toFixed(2) + ')';
          ctx.lineWidth = Math.max(1, particle.size * 0.9);
          ctx.moveTo(particle.trailX, particle.trailY);
          ctx.lineTo(particle.x, particle.y);
          ctx.stroke();
        }

        if (metrics.samples === 0 && state !== 'error') {
          ctx.fillStyle = 'rgba(20, 20, 20, 0.35)';
          ctx.font = '12px sans-serif';
          ctx.fillText('No sampled events yet', 12, frameState.height - 14);
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
        adaptiveParticleFactor = 1;
        lowFpsMs = 0;
        recoverFpsMs = 0;
        pollMetrics();
      });
    }
  }

  window.WormholeDemo = { bootstrap: bootstrapWormhole };
})();
