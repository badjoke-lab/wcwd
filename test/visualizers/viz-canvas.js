(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function computeDpr(deviceDpr, isLite, width, height) {
    const hardCap = isLite ? 1.25 : 1.5;
    const base = clamp(deviceDpr || 1, 1, hardCap);
    const pixelBudget = isLite ? 1200000 : 1800000;
    const area = Math.max(1, width * height);
    const budgetDpr = Math.sqrt(pixelBudget / area);
    return clamp(Math.min(base, budgetDpr || 1), 1, hardCap);
  }

  function sameDimensions(a, b) {
    return !!a && !!b &&
      a.width === b.width &&
      a.height === b.height &&
      a.dpr === b.dpr;
  }

  function VizCanvas(options) {
    const opts = options || {};
    this.container = opts.container;
    this.onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : function () {};
    this.onUnmount = typeof opts.onUnmount === 'function' ? opts.onUnmount : function () {};
    this.background = opts.background || 'transparent';
    this.perfGovernor = opts.perfGovernor;
    this.isLite = Boolean(opts.isLite);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viz-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.frame = 0;
    this.animationId = null;
    this.resizeRafId = null;
    this.lastTime = 0;
    this.lastRenderTime = 0;
    this.paused = false;
    this.stats = { fps: 0 };
    this.dimensions = null;
    this.pendingResizeForce = false;

    this.resizeObserver = null;
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    this.resizeRequestHandler = this.requestResize.bind(this, false);
    this.loop = this.loop.bind(this);
  }

  VizCanvas.prototype.mount = function () {
    if (!this.container) return;

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.requestResize(true);

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.resizeRequestHandler);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.resizeRequestHandler);
    }

    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.resume();
  };

  VizCanvas.prototype.requestResize = function (force) {
    this.pendingResizeForce = this.pendingResizeForce || Boolean(force);

    if (this.resizeRafId) return;

    this.resizeRafId = requestAnimationFrame(() => {
      this.resizeRafId = null;
      const forceNow = this.pendingResizeForce;
      this.pendingResizeForce = false;
      this.resize(forceNow);
    });
  };

  VizCanvas.prototype.resize = function (force) {
    if (!this.container || !this.canvas || !this.ctx) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (width < 1 || height < 1) return;

    const dpr = computeDpr(window.devicePixelRatio || 1, this.isLite, width, height);
    const nextDimensions = { width: width, height: height, dpr: dpr };

    if (!force && sameDimensions(this.dimensions, nextDimensions)) {
      return;
    }

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.dimensions = nextDimensions;
  };

  VizCanvas.prototype.handleVisibilityChange = function () {
    if (document.hidden) {
      this.pause();
      return;
    }

    this.requestResize(true);
    this.resume();
  };

  VizCanvas.prototype.pause = function () {
    this.paused = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  };

  VizCanvas.prototype.resume = function () {
    if (!this.paused && this.animationId) return;

    this.paused = false;
    this.lastTime = 0;
    this.lastRenderTime = 0;

    if (!this.dimensions) {
      this.requestResize(true);
    }

    this.animationId = requestAnimationFrame(this.loop);
  };

  VizCanvas.prototype.setLite = function (isLite) {
    const nextLite = Boolean(isLite);
    this.isLite = nextLite;

    if (this.perfGovernor && this.perfGovernor.setLite) {
      this.perfGovernor.setLite(nextLite);
    }

    this.requestResize(true);
  };

  VizCanvas.prototype.loop = function (time) {
    if (this.paused) return;

    if (!this.dimensions) {
      this.animationId = requestAnimationFrame(this.loop);
      return;
    }

    if (!this.lastTime) {
      this.lastTime = time;
      this.lastRenderTime = time;
    }

    const maxFps = this.perfGovernor && this.perfGovernor.getMaxFps
      ? this.perfGovernor.getMaxFps()
      : 60;
    const minInterval = 1000 / Math.max(1, maxFps);
    const elapsedSinceRender = time - this.lastRenderTime;

    if (elapsedSinceRender >= minInterval) {
      const rawDelta = time - this.lastTime;
      const delta = clamp(rawDelta || 16, 1, 64);

      this.lastTime = time;
      this.lastRenderTime = time;
      this.frame += 1;
      this.stats.fps = delta > 0 ? Math.min(120, 1000 / delta) : 0;

      try {
        this.clear();
        this.onFrame(this.ctx, {
          frame: this.frame,
          time: time,
          delta: delta,
          isLite: this.isLite,
          fps: this.stats.fps,
          width: this.dimensions.width,
          height: this.dimensions.height,
          dpr: this.dimensions.dpr,
          perfGovernor: this.perfGovernor
        });
      } catch (error) {
        console.error('VizCanvas frame error:', error);
        this.pause();
        return;
      }
    }

    this.animationId = requestAnimationFrame(this.loop);
  };

  VizCanvas.prototype.clear = function () {
    if (!this.ctx || !this.dimensions) return;

    const width = this.dimensions.width;
    const height = this.dimensions.height;

    if (this.background === 'transparent') {
      this.ctx.clearRect(0, 0, width, height);
      return;
    }

    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, width, height);
  };

  VizCanvas.prototype.destroy = function () {
    this.pause();

    if (this.resizeRafId) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.resizeRequestHandler);
    }

    document.removeEventListener('visibilitychange', this.visibilityHandler);

    try {
      this.onUnmount();
    } catch (error) {
      console.error('VizCanvas unmount error:', error);
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  };

  window.VizCanvas = {
    create: function (options) {
      return new VizCanvas(options);
    }
  };
})();
