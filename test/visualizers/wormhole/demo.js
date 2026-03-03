(function () {
  function randomParticle(width, height) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(width, height) * (0.35 + Math.random() * 0.55);

    return {
      x: width * 0.5 + Math.cos(angle) * radius,
      y: height * 0.5 + Math.sin(angle) * radius,
      size: 1 + Math.random() * 2,
      speed: 0.02 + Math.random() * 0.04,
      alpha: 0.3 + Math.random() * 0.6
    };
  }

  function createParticles(count, width, height) {
    const particles = [];
    for (let i = 0; i < count; i += 1) {
      particles.push(randomParticle(width, height));
    }
    return particles;
  }

  function bootstrapWormhole() {
    const root = document.querySelector('[data-visualizer-content]');
    if (!root || !window.VizCanvas || !window.PerfGovernor) return;

    const canvasHost = document.createElement('div');
    canvasHost.className = 'wormhole-canvas-host';

    const debugPanel = document.createElement('div');
    debugPanel.className = 'wormhole-debug';

    root.innerHTML = '';
    root.append(canvasHost, debugPanel);

    const isLite = window.VisualizerShell && window.VisualizerShell.isLite ? window.VisualizerShell.isLite() : false;
    const governor = window.PerfGovernor.create({
      isLite: isLite,
      maxFps: 60,
      maxParticles: 520,
      liteMaxFps: 30,
      liteParticleRatio: 0.25
    });

    let particles = [];

    const viz = window.VizCanvas.create({
      container: canvasHost,
      isLite: isLite,
      perfGovernor: governor,
      background: 'transparent',
      onFrame: function (ctx, state) {
        const desiredCount = governor.getMaxParticles();

        if (particles.length !== desiredCount) {
          particles = createParticles(desiredCount, state.width, state.height);
        }

        const centerX = state.width * 0.5;
        const centerY = state.height * 0.5;
        const speedScale = Math.max(0.5, state.delta / 16);

        ctx.fillStyle = 'rgba(10, 10, 15, 0.16)';
        ctx.fillRect(0, 0, state.width, state.height);

        const drawCandidates = governor.capParticles(particles) || [];

        for (let i = 0; i < drawCandidates.length; i += 1) {
          const particle = drawCandidates[i];
          particle.x += (centerX - particle.x) * particle.speed * speedScale;
          particle.y += (centerY - particle.y) * particle.speed * speedScale;

          const inside = governor.isInsideBounds(particle, { width: state.width, height: state.height }, 24);
          if (!inside) continue;

          const distX = centerX - particle.x;
          const distY = centerY - particle.y;
          const dist = Math.sqrt(distX * distX + distY * distY);

          if (dist < 8) {
            particles[i] = randomParticle(state.width, state.height);
            continue;
          }

          ctx.beginPath();
          ctx.fillStyle = 'rgba(30, 30, 45, ' + particle.alpha.toFixed(2) + ')';
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }

        debugPanel.textContent =
          'fps: ' + Math.round(state.fps) +
          ' / particles: ' + drawCandidates.length +
          ' / lite: ' + (state.isLite ? 'ON' : 'OFF');
      }
    });

    viz.mount();

    if (window.VisualizerShell && window.VisualizerShell.onLiteChange) {
      window.VisualizerShell.onLiteChange(function (nextLite) {
        viz.setLite(nextLite);
      });
    }
  }

  window.WormholeDemo = { bootstrap: bootstrapWormhole };
})();
