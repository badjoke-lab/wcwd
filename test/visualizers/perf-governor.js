(function () {
  function parseLiteFromSearch(search) {
    return new URLSearchParams(search || window.location.search).get('lite') === '1';
  }

  function PerfGovernor(options) {
    const opts = options || {};
    this.isLite = Boolean(opts.isLite);
    this.baseMaxFps = opts.maxFps || 60;
    this.baseMaxParticles = opts.maxParticles || 240;
    this.liteMaxFps = opts.liteMaxFps || 30;
    this.liteParticleRatio = typeof opts.liteParticleRatio === 'number' ? opts.liteParticleRatio : 0.25;
  }

  PerfGovernor.fromLocation = function (options) {
    return new PerfGovernor(Object.assign({}, options, { isLite: parseLiteFromSearch(window.location.search) }));
  };

  PerfGovernor.prototype.setLite = function (isLite) {
    this.isLite = Boolean(isLite);
  };

  PerfGovernor.prototype.getMaxFps = function () {
    return this.isLite ? Math.min(this.baseMaxFps, this.liteMaxFps) : this.baseMaxFps;
  };

  PerfGovernor.prototype.getMaxParticles = function () {
    if (!this.isLite) return this.baseMaxParticles;
    return Math.max(1, Math.floor(this.baseMaxParticles * this.liteParticleRatio));
  };

  PerfGovernor.prototype.capParticles = function (particles) {
    const maxParticles = this.getMaxParticles();
    if (!Array.isArray(particles) || particles.length <= maxParticles) {
      return particles;
    }

    const stride = Math.ceil(particles.length / maxParticles);
    const sampled = [];
    for (let i = 0; i < particles.length; i += stride) {
      sampled.push(particles[i]);
      if (sampled.length >= maxParticles) break;
    }
    return sampled;
  };

  PerfGovernor.prototype.isInsideBounds = function (particle, bounds, padding) {
    const pad = padding || 0;
    if (!particle || !bounds) return false;
    return (
      particle.x >= -pad &&
      particle.x <= bounds.width + pad &&
      particle.y >= -pad &&
      particle.y <= bounds.height + pad
    );
  };

  window.PerfGovernor = {
    create: function (options) {
      return new PerfGovernor(options);
    },
    fromLocation: PerfGovernor.fromLocation,
    parseLiteFromSearch: parseLiteFromSearch
  };
})();
