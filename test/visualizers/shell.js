(function () {
  function withLiteQuery(isLite) {
    const url = new URL(window.location.href);
    if (isLite) {
      url.searchParams.set('lite', '1');
    } else {
      url.searchParams.delete('lite');
    }
    return url;
  }

  function createShell(options) {
    const root = document.querySelector('[data-visualizer-shell]');
    if (!root) return;

    const title = options.title || 'Visualizer';
    const description = options.description || '';
    const isLite = new URLSearchParams(window.location.search).get('lite') === '1';

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

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'visualizer-shell-toggle';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = isLite;
    toggleInput.setAttribute('aria-label', 'Lightweight mode');

    toggleInput.addEventListener('change', function () {
      const next = withLiteQuery(toggleInput.checked);
      window.history.replaceState({}, '', next);
    });

    const toggleText = document.createElement('span');
    toggleText.textContent = 'Lightweight mode';

    toggleLabel.append(toggleInput, toggleText);
    header.append(headingWrap, toggleLabel);

    const canvasRegion = document.createElement('div');
    canvasRegion.className = 'visualizer-shell-canvas';

    const content = document.querySelector('[data-visualizer-content]');
    if (content) {
      canvasRegion.appendChild(content);
    }

    const footnote = document.createElement('p');
    footnote.className = 'visualizer-shell-footnote';
    footnote.textContent = 'Free-tier mode / pseudo realtime';

    shell.append(header, canvasRegion, footnote);
    root.appendChild(shell);
  }

  window.VisualizerShell = { createShell };
})();
