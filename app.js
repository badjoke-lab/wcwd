const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const jpyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const STORAGE_KEY = 'wcwd_previous_stats';

const CORS_PROXY = "https://api.allorigins.win/get?url=";

async function fetchJSON(url) {
  // IMPORTANT: AllOrigins /get?url= does NOT allow encoded URLs.
  const res = await fetch(CORS_PROXY + url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);

  const data = await res.json();

  // AllOrigins wraps JSON inside "contents"
  if (data && data.contents) {
    return JSON.parse(data.contents);
  }

  return data;
}

async function fetchWLDMarket() {
  const data = await fetchJSON('https://api.coingecko.com/api/v3/coins/worldcoin');
  const market = data.market_data || {};
  const priceUSD = market.current_price?.usd ?? 0;
  const priceJPY = market.current_price?.jpy ?? priceUSD * (market.current_price?.jpy / market.current_price?.usd || 0);
  return {
    priceUSD,
    priceJPY,
    change24h: market.price_change_percentage_24h ?? 0,
    marketCap: market.market_cap?.usd ?? 0,
    volume: market.total_volume?.usd ?? 0,
    sparkline: market.sparkline_7d?.price || [],
  };
}

async function fetchWorldchainStats(sampleBlocks = 20) {
  const base = 'https://api.worldscan.io/api';
  const latest = await fetchJSON(`${base}?module=proxy&action=eth_blockNumber`);
  const latestBlockHex = latest.result;
  const latestBlockNum = parseInt(latestBlockHex, 16);

  const blocks = [];
  let gasSamples = [];
  for (let i = 0; i < sampleBlocks; i++) {
    const targetNum = latestBlockNum - i;
    const hex = '0x' + targetNum.toString(16);
    const block = await fetchJSON(`${base}?module=proxy&action=eth_getBlockByNumber&tag=${hex}&boolean=true`);
    if (block?.result) {
      const b = block.result;
      blocks.push(b);
      if (b.baseFeePerGas) gasSamples.push(parseInt(b.baseFeePerGas, 16));
    }
  }

  blocks.sort((a, b) => parseInt(a.number, 16) - parseInt(b.number, 16));
  const txs = blocks.flatMap((b) => b.transactions || []);

  const timestamps = blocks.map((b) => parseInt(b.timestamp, 16));
  const txCounts = blocks.map((b) => (b.transactions ? b.transactions.length : 0));
  const totalTx = txCounts.reduce((a, b) => a + b, 0);
  const timeDelta = Math.max(1, timestamps[timestamps.length - 1] - timestamps[0]);
  const tps = totalTx / timeDelta;
  const txCount24h = Math.round(tps * 86400);

  const uniqueAddresses = new Set();
  txs.forEach((tx) => {
    if (tx.from) uniqueAddresses.add(tx.from.toLowerCase());
    if (tx.to) uniqueAddresses.add(tx.to.toLowerCase());
  });
  const newAddresses = uniqueAddresses.size;
  const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const totalAddresses = (previous.totalAddresses || 0) + newAddresses;

  const gasPriceRes = await fetchJSON(`${base}?module=proxy&action=eth_gasPrice`);
  const gasPriceGwei = parseInt(gasPriceRes.result, 16) / 1e9;
  const medianTps = median(txCounts.map((c, idx) => {
    const dt = idx === 0 ? 12 : timestamps[idx] - timestamps[idx - 1] || 12;
    return c / dt;
  }));

  return {
    blocks,
    txs,
    tps,
    txCount24h,
    newAddresses,
    totalAddresses,
    gasPriceGwei,
    gasBaseline: gasSamples.length ? average(gasSamples) / 1e9 : gasPriceGwei,
    medianTps,
  };
}

function computeActivityBreakdown(txs) {
  const counts = {
    native: 0,
    token: 0,
    contract: 0,
    other: 0,
  };

  txs.forEach((tx) => {
    const input = (tx.input || '').toLowerCase();
    if (!input || input === '0x') {
      counts.native += 1;
    } else if (input.startsWith('0xa9059cbb')) {
      counts.token += 1;
    } else if (input.length > 2) {
      counts.contract += 1;
    } else {
      counts.other += 1;
    }
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return {
    native: (counts.native / total) * 100,
    token: (counts.token / total) * 100,
    contract: (counts.contract / total) * 100,
    other: (counts.other / total) * 100,
  };
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function formatDiff(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function createSparklineSvg(data = [], width = 120, height = 40) {
  if (!data.length) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = (i * step).toFixed(2);
      const y = (height - ((v - min) / range) * height).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>`;
}

function renderNetworkStats(stats, diff = {}) {
  const container = document.getElementById('network-stats');
  container.innerHTML = '';

  const cards = [
    {
      title: 'TPS',
      value: stats.tps.toFixed(2),
      diff: diff.tps || 0,
    },
    {
      title: '24h TX Count',
      value: numberFormatter.format(stats.txCount24h),
      diff: diff.txCount24h || 0,
    },
    {
      title: 'New Addresses (est)',
      value: numberFormatter.format(stats.newAddresses),
      diff: diff.newAddresses || 0,
    },
    {
      title: 'Total Addresses (est)',
      value: numberFormatter.format(stats.totalAddresses),
      diff: diff.totalAddresses || 0,
    },
    {
      title: 'Gas Price (Gwei)',
      value: stats.gasPriceGwei.toFixed(2),
      diff: diff.gasPriceGwei || 0,
    },
  ];

  cards.forEach((card) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${card.value}</div>
      <div class="card-diff muted">Diff: ${formatDiff(card.diff)}</div>
    `;
    container.appendChild(article);
  });
}

function renderMarketStats(market) {
  const container = document.getElementById('market-stats');
  container.innerHTML = '';
  const cards = [
    { title: 'Price (USD)', value: currencyFormatter.format(market.priceUSD) },
    { title: 'Price (JPY)', value: jpyFormatter.format(market.priceJPY) },
    { title: '24h Change', value: `${market.change24h?.toFixed(2) ?? '0.00'}%` },
    { title: 'Market Cap', value: currencyFormatter.format(market.marketCap) },
    { title: 'Volume', value: currencyFormatter.format(market.volume) },
  ];

  cards.forEach((card) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.innerHTML = `
      <div class="card-title">${card.title}</div>
      <div class="card-value">${card.value}</div>
    `;
    container.appendChild(article);
  });

  if (market.sparkline?.length) {
    const sparkCard = document.createElement('article');
    sparkCard.className = 'card';
    sparkCard.innerHTML = `
      <div class="card-title">7d Sparkline</div>
      <div class="sparkline">${createSparklineSvg(market.sparkline, 260, 60)}</div>
    `;
    container.appendChild(sparkCard);
  }
}

function renderActivityBreakdown(breakdown) {
  const container = document.getElementById('activity-breakdown');
  container.innerHTML = '';
  const entries = [
    { label: 'Native Transfer', value: breakdown.native },
    { label: 'Token Transfer', value: breakdown.token },
    { label: 'Contract Call', value: breakdown.contract },
    { label: 'Other', value: breakdown.other },
  ];

  entries.forEach((entry) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.innerHTML = `
      <div class="card-title">${entry.label}</div>
      <div class="card-value">${entry.value.toFixed(1)}%</div>
      <div class="progress"><span style="width:${entry.value}%"></span></div>
    `;
    container.appendChild(article);
  });
}

function renderCharts(priceSeries, txSeries) {
  drawLineCanvas('priceChart', priceSeries, '#0057ff');
  drawLineCanvas('txChart', txSeries, '#00aa6c');
}

function drawLineCanvas(id, data, color) {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.clientWidth || 300;
  const height = canvas.height = canvas.clientHeight || 200;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (!data || !data.length) return;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  ctx.beginPath();
  data.forEach((val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderAlerts(stats) {
  const container = document.getElementById('alerts');
  const alerts = [];
  const medianTps = stats.medianTps || stats.tps;
  if (stats.tps > medianTps * 1.4) {
    alerts.push({ title: 'Spike Detected', detail: 'TPS significantly above baseline.' });
  }
  if (stats.tps < medianTps * 0.7) {
    alerts.push({ title: 'Drop Detected', detail: 'TPS significantly below baseline.' });
  }
  if (stats.gasPriceGwei > stats.gasBaseline * 1.5) {
    alerts.push({ title: 'High Gas', detail: 'Gas price above baseline.' });
  }

  container.innerHTML = '<h2>Alerts</h2>';
  const grid = document.createElement('div');
  grid.className = 'alerts-grid';

  if (!alerts.length) {
    const empty = document.createElement('div');
    empty.className = 'alert';
    empty.textContent = 'No alerts. All metrics look normal.';
    grid.appendChild(empty);
  } else {
    alerts.forEach((a) => {
      const div = document.createElement('div');
      div.className = 'alert';
      div.innerHTML = `<strong>${a.title}</strong><div class="muted">${a.detail}</div>`;
      grid.appendChild(div);
    });
  }

  container.appendChild(grid);
}

function saveDiff(stats) {
  const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tps: stats.tps,
    txCount24h: stats.txCount24h,
    newAddresses: stats.newAddresses,
    totalAddresses: stats.totalAddresses,
    gasPriceGwei: stats.gasPriceGwei,
  }));
  return {
    tps: stats.tps - (previous.tps || 0),
    txCount24h: stats.txCount24h - (previous.txCount24h || 0),
    newAddresses: stats.newAddresses - (previous.newAddresses || 0),
    totalAddresses: stats.totalAddresses - (previous.totalAddresses || 0),
    gasPriceGwei: stats.gasPriceGwei - (previous.gasPriceGwei || 0),
  };
}

function buildTxTrend(blocks) {
  const buckets = {};
  blocks.forEach((b) => {
    const ts = parseInt(b.timestamp, 16) * 1000;
    const day = new Date(ts);
    const key = `${day.getUTCFullYear()}-${day.getUTCMonth() + 1}-${day.getUTCDate()}`;
    buckets[key] = (buckets[key] || 0) + (b.transactions ? b.transactions.length : 0);
  });
  const entries = Object.entries(buckets)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .slice(-7);
  return entries.map(([, count]) => count);
}

async function loadDashboard() {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Loading...';
  try {
    const [market, stats] = await Promise.all([
      fetchWLDMarket(),
      fetchWorldchainStats(),
    ]);

    const activity = computeActivityBreakdown(stats.txs || []);
    const diff = saveDiff(stats);
    renderNetworkStats(stats, diff);
    renderMarketStats(market);
    renderActivityBreakdown(activity);
    renderCharts(market.sparkline || [], buildTxTrend(stats.blocks || []));
    renderAlerts(stats);
  } catch (err) {
    console.error(err);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

window.addEventListener('load', () => {
  renderNetworkStats({ tps: 0, txCount24h: 0, newAddresses: 0, totalAddresses: 0, gasPriceGwei: 0 }, {});
  renderMarketStats({ priceUSD: 0, priceJPY: 0, change24h: 0, marketCap: 0, volume: 0, sparkline: [] });
  renderActivityBreakdown({ native: 0, token: 0, contract: 0, other: 0 });
  renderCharts([], []);
  renderAlerts({ tps: 0, medianTps: 0, gasPriceGwei: 0, gasBaseline: 0 });
  loadDashboard();
  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('click', loadDashboard);
});
