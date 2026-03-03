(function () {
  function clampDpr(value) {
    return Math.max(1, Math.min(value || 1, 2));
  }

  function VizCanvas(options) {
    const opts = options || {};
    this.container = opts.container;
    this.onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : function () {};
    this.background = opts.background || 'transparent';
    this.perfGovernor = opts.perfGovernor;
    this.isLite = Boolean(opts.isLite);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viz-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.frame = 0;
    this.animationId = null;
    this.lastTime = 0;
    this.lastRenderTime = 0;
    this.paused = false;
    this.stats = { fps: 0 };

    this.resizeObserver = null;
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    this.loop = this.loop.bind(this);
  }

  VizCanvas.prototype.mount = function () {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize.bind(this));
    this.resizeObserver.observe(this.container);
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.resume();
  };

  VizCanvas.prototype.resize = function () {
    if (!this.container || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = clampDpr(window.devicePixelRatio || 1);

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dimensions = { width: width, height: height, dpr: dpr };
  };

  VizCanvas.prototype.handleVisibilityChange = function () {
    if (document.hidden) {
      this.pause();
      return;
    }
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
    this.animationId = requestAnimationFrame(this.loop);
  };

  VizCanvas.prototype.setLite = function (isLite) {
    this.isLite = Boolean(isLite);
    if (this.perfGovernor && this.perfGovernor.setLite) {
      this.perfGovernor.setLite(this.isLite);
    }
  };

  VizCanvas.prototype.loop = function (time) {
    if (this.paused) return;
    if (!this.lastTime) {
      this.lastTime = time;
      this.lastRenderTime = time;
    }

    const maxFps = this.perfGovernor && this.perfGovernor.getMaxFps ? this.perfGovernor.getMaxFps() : 60;
    const minInterval = 1000 / Math.max(1, maxFps);
    const elapsedSinceRender = time - this.lastRenderTime;

    if (elapsedSinceRender >= minInterval) {
      const delta = time - this.lastTime;
      this.lastTime = time;
      this.lastRenderTime = time;
      this.frame += 1;

      this.stats.fps = delta > 0 ? Math.min(120, 1000 / delta) : 0;
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler);
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
