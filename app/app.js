// Glaciar Antártico — visor ITS_LIVE
// Stack: Leaflet + proj4leaflet (EPSG:3031). Sin build.

const state = {
  map: null,
  itsLayer: null,
  glaciers: null,
  glaciersLayer: null,
  showGlaciers: true,
  selectedGlacier: null,
  itsYear: '0000',
  itsVar: 'v',
};

const ANTARCTIC_CRS_BOUNDS = 12367396.2185;
const antarcticCRS = () => new L.Proj.CRS(
  'EPSG:3031',
  '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
  {
    origin: [-ANTARCTIC_CRS_BOUNDS, ANTARCTIC_CRS_BOUNDS],
    resolutions: [
      67733.46880027094, 33866.73440013547, 16933.367200067736,
      8466.683600033868, 4233.341800016934, 2116.670900008467,
      1058.3354500042335, 529.1677250021168, 264.5838625010584,
    ],
  }
);

// ITS_LIVE — servimos un COG GeoTIFF (downsampled a ~1km desde el NetCDF
// original de 120m, 8.6 GB) desde GitHub Pages con range-requests. Solo
// tenemos 1 año (2022) + variable 'v' (magnitud) por restricción de espacio.
// Para más años/variables: ver scripts/fetch_itslive.py + itslive_to_cog.py.
const ITSLIVE_COGS = {
  '2010_v': 'data/itslive_RGI19A_2010_v_1km.tif',
  '2022_v': 'data/itslive_RGI19A_2022_v_1km.tif',
};
const ITSLIVE_YEARS_AVAILABLE = ['2010', '2022'];

function getCogPath(year, varName) {
  const key = `${year}_${varName}`;
  return ITSLIVE_COGS[key] || null;
}

// Palette para velocidad glaciar: turbo (perceptualmente uniforme)
const VEL_PALETTE = ['#30123b', '#3e3691', '#4669db', '#3b9be1', '#26bf9a',
                     '#5cc640', '#a4d22f', '#dbcd2c', '#f4a228', '#e64b1f',
                     '#bb0a07', '#7a0403'];
const VEL_DOMAIN = [0, 2000];  // m/yr — clipped log-friendly

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'velocidad' && state.map) {
      setTimeout(() => state.map.invalidateSize(), 50);
    }
    if (btn.dataset.tab === 'sensores') initSensoresCharts();
    if (btn.dataset.tab === 'historico') initHistoricoChart();
    if (btn.dataset.tab === 'prediccion') initPrediccionChart();
  });
});

// ---------- Charts (datos públicos sintetizados) ----------
let chartsInit = { sensores: false, historico: false, prediccion: false };

function commonChartOpts(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e6edf3', font: { size: 11 } } },
      title: { display: !!title, text: title, color: '#e6edf3' },
    },
    scales: {
      x: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' } },
      y: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' } },
    },
  };
}

function initSensoresCharts() {
  if (chartsInit.sensores) return;
  chartsInit.sensores = true;

  // 1. Sea ice extent — NSIDC annual min/max 1979-2024
  // Datos: medias móviles 5-año aprox. (NSIDC Sea Ice Index v3)
  const years = Array.from({length: 46}, (_, i) => 1979 + i);
  // Pares (min febrero, max septiembre) en M km²
  const seaIceMin = [2.93,2.81,2.74,3.12,2.84,2.69,3.18,3.07,3.21,3.18,2.86,3.13,
                     3.21,2.91,2.59,3.41,3.04,2.84,3.31,3.51,3.40,3.27,3.40,3.44,
                     3.51,3.59,3.07,2.93,2.88,3.61,3.18,3.07,3.46,3.84,4.16,3.69,
                     2.29,2.55,2.95,2.71,2.65,2.41,1.92,1.79,2.07,2.10];
  const seaIceMax = [18.31,18.51,18.50,18.92,18.46,18.71,18.71,19.01,18.66,18.34,
                     18.06,18.84,18.69,18.79,18.39,18.56,18.81,19.18,19.04,18.79,
                     19.02,19.04,18.83,18.41,18.62,18.95,19.13,19.07,19.30,18.94,
                     19.16,19.06,19.45,19.47,20.11,18.83,18.45,18.05,18.42,18.62,
                     18.50,18.93,17.84,16.96,17.27,17.51];
  new Chart(document.getElementById('chart-sea-ice'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        { label: 'Máximo anual (Sep)', data: seaIceMax,
          borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)',
          tension: 0.3, pointRadius: 1 },
        { label: 'Mínimo anual (Feb)', data: seaIceMin,
          borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.1)',
          tension: 0.3, pointRadius: 1 },
      ],
    },
    options: Object.assign(commonChartOpts(), {
      scales: {
        x: { ticks: { color: '#e6edf3', maxTicksLimit: 12 }, grid: { color: '#2a3441' }, title: { display: true, text: 'Año', color: '#8b949e' } },
        y: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' }, title: { display: true, text: 'Extensión (millones km²)', color: '#8b949e' } },
      },
    }),
  });

  // 2. Mass loss — GRACE/GRACE-FO 2002-2024 (Gt acumulado)
  const yearsGRACE = Array.from({length: 23}, (_, i) => 2002 + i);
  const massCumulative = [0, -50, -110, -180, -250, -330, -420, -510, -620,
                          -750, -880, -1020, -1170, -1340, -1490, -1640, -1800,
                          -1960, -2130, -2300, -2480, -2660, -2840];
  new Chart(document.getElementById('chart-mass-loss'), {
    type: 'line',
    data: {
      labels: yearsGRACE,
      datasets: [{
        label: 'Anomalía de masa acumulada (Gt)',
        data: massCumulative,
        borderColor: '#e67e22',
        backgroundColor: 'rgba(230,126,34,0.2)',
        fill: true,
        tension: 0.3, pointRadius: 1,
      }],
    },
    options: Object.assign(commonChartOpts(), {
      scales: {
        x: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' }, title: { display: true, text: 'Año', color: '#8b949e' } },
        y: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' }, title: { display: true, text: 'Gt (relativo a 2002)', color: '#8b949e' } },
      },
    }),
  });
}

function initHistoricoChart() {
  if (chartsInit.historico) return;
  chartsInit.historico = true;

  // CO₂ EPICA Dome C (ka antes del presente)
  // Lüthi 2008 + Bereiter 2015 + medición moderna
  const periods = ['MIS-31\n(1070 ka)', 'Plio temprano\n(3500 ka)', 'Eemiense\n(125 ka)',
                   'LGM\n(21 ka)', 'Holoceno\n(11 ka)', 'Pre-ind\n(1750)',
                   'Actual\n(2024)', 'SSP5-8.5\n(2100)'];
  const co2 = [400, 410, 285, 180, 270, 280, 421, 800];
  const tempAnom = [3.0, 2.5, 1.5, -8.0, 0.0, 0.0, 1.2, 3.5];

  new Chart(document.getElementById('chart-paleoclima'), {
    type: 'bar',
    data: {
      labels: periods,
      datasets: [
        { label: 'CO₂ atmosférico (ppm)', data: co2, backgroundColor: '#5fb878',
          yAxisID: 'y' },
        { label: 'Anomalía T global (°C vs pre-ind)', data: tempAnom, type: 'line',
          borderColor: '#e74c3c', backgroundColor: '#e74c3c', tension: 0.2,
          yAxisID: 'y1', pointRadius: 5 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: {
        x: { ticks: { color: '#e6edf3', font: { size: 10 } }, grid: { color: '#2a3441' } },
        y: { ticks: { color: '#5fb878' }, grid: { color: '#2a3441' }, title: { display: true, text: 'CO₂ (ppm)', color: '#5fb878' }, beginAtZero: true },
        y1: { ticks: { color: '#e74c3c' }, position: 'right', grid: { display: false }, title: { display: true, text: '°C anomalía', color: '#e74c3c' } },
      },
    },
  });
}

function initPrediccionChart() {
  if (chartsInit.prediccion) return;
  chartsInit.prediccion = true;

  // IPCC AR6 + ISMIP6 — Antarctic contribution to SLR in mm by year
  // Mediana del ensemble por escenario (Edwards 2021 + Chen 2021)
  const years = Array.from({length: 11}, (_, i) => 2000 + i*10);
  const ssp126 = [0, 5, 12, 20, 28, 35, 40, 44, 47, 49, 50];
  const ssp245 = [0, 5, 13, 22, 32, 45, 58, 68, 76, 82, 85];
  const ssp585 = [0, 5, 14, 25, 40, 60, 80, 95, 110, 122, 130];
  const ssp585hi = [0, 5, 18, 40, 80, 140, 220, 300, 380, 450, 510];

  new Chart(document.getElementById('chart-slr-projection'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        { label: 'SSP1-2.6 (mediana)', data: ssp126,
          borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)',
          tension: 0.3 },
        { label: 'SSP2-4.5 (mediana)', data: ssp245,
          borderColor: '#f39c12', backgroundColor: 'rgba(243,156,18,0.1)',
          tension: 0.3 },
        { label: 'SSP5-8.5 (mediana)', data: ssp585,
          borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.1)',
          tension: 0.3 },
        { label: 'SSP5-8.5 high-end (MICI on, DeConto 2021)', data: ssp585hi,
          borderColor: '#c0392b', borderDash: [4, 4],
          backgroundColor: 'rgba(192,57,43,0.05)', tension: 0.3 },
      ],
    },
    options: Object.assign(commonChartOpts(), {
      scales: {
        x: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' }, title: { display: true, text: 'Año', color: '#8b949e' } },
        y: { ticks: { color: '#e6edf3' }, grid: { color: '#2a3441' }, title: { display: true, text: 'Contribución SLR (mm)', color: '#8b949e' } },
      },
    }),
  });
}

// ---------- Mapa ----------
function initMap() {
  state.map = L.map('map', {
    crs: antarcticCRS(),
    center: [-90, 0],
    zoom: 2,
    minZoom: 0,
    maxZoom: 8,
    attributionControl: true,
  });

  // Basemap MOA via NASA GIBS EPSG:3031
  L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3031/best/wms.cgi', {
    layers: 'MODIS_Terra_Mosaic',
    format: 'image/jpeg',
    transparent: false,
    attribution: 'NASA GIBS · MODIS Mosaic of Antarctica',
  }).addTo(state.map);

  applyItsLiveLayer();
  addLegend();
}

// Cache de georasters parsed para evitar re-fetch
const georasterCache = {};

async function loadGeoraster(cogPath) {
  if (georasterCache[cogPath]) return georasterCache[cogPath];
  const response = await fetch(cogPath);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buf = await response.arrayBuffer();
  const georaster = await parseGeoraster(buf);
  georasterCache[cogPath] = { georaster, sizeKB: Math.round(buf.byteLength / 1024) };
  return georasterCache[cogPath];
}

function makeItsLiveLayer(georaster, opacity = 0.82) {
  const scale = chroma.scale(VEL_PALETTE).domain(VEL_DOMAIN);
  return new GeoRasterLayer({
    georaster, opacity, resolution: 64,
    pixelValuesToColorFn: vals => {
      const v = vals[0];
      if (v === null || v === undefined || v < 0) return null;
      return scale(Math.min(v, VEL_DOMAIN[1])).hex();
    },
    attribution: 'ITS_LIVE · NASA MEaSUREs (Gardner et al.)',
  });
}

state.itsLayer2 = null;  // capa 2010 cuando modo comparación on
state.showCompare = false;

async function applyItsLiveLayer() {
  if (state.itsLayer) state.map.removeLayer(state.itsLayer);
  if (state.itsLayer2) { state.map.removeLayer(state.itsLayer2); state.itsLayer2 = null; }
  const status = document.getElementById('status');
  const cogPath = getCogPath(state.itsYear, state.itsVar);
  if (!cogPath) {
    status.innerHTML =
      `⚠ Combinación <strong>${state.itsYear} / ${state.itsVar}</strong> no disponible.<br>` +
      'Solo bajado: 2010 + 2022 / v (magnitud). Más años o componentes vx/vy:<br>' +
      '<code>python scripts/fetch_itslive.py --year YYYY --vars vx</code>';
    return;
  }
  status.textContent = `Cargando COG ITS_LIVE ${state.itsYear}…`;
  try {
    const { georaster, sizeKB } = await loadGeoraster(cogPath);
    state.itsLayer = makeItsLiveLayer(georaster, 0.82);
    state.itsLayer.addTo(state.map);

    if (state.showCompare && state.itsYear !== '2010') {
      // Cargar 2010 como capa de referencia debajo
      const cogPath2 = getCogPath('2010', state.itsVar);
      if (cogPath2) {
        const { georaster: gr2 } = await loadGeoraster(cogPath2);
        state.itsLayer2 = makeItsLiveLayer(gr2, 0.55);
        state.itsLayer2.addTo(state.map);
        state.itsLayer.bringToFront();
      }
    }

    status.innerHTML = `<strong>ITS_LIVE ${state.itsYear} · v (m/yr)</strong><br>` +
                       `COG 1km (${sizeKB} KB) servido desde GH Pages.<br>` +
                       (state.showCompare && state.itsLayer2 ?
                        '<em style="color:#5fb878">Modo comparación: 2010 (transparente) + ' +
                        state.itsYear + ' (encima)</em>' :
                        'Glaciares >500 m/yr en colores cálidos.');
  } catch (e) {
    console.error('ITS_LIVE COG load error:', e);
    status.innerHTML =
      `⚠ COG no disponible (${e.message}).<br>` +
      'Genera local con:<br>' +
      '<code>python scripts/fetch_itslive.py</code><br>' +
      '<code>python scripts/itslive_to_cog.py --year ' + state.itsYear + '</code>';
  }
}

function addLegend() {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <div class="legend-title">Velocidad (m/yr)</div>
      <div class="legend-bar"></div>
      <div class="legend-labels"><span>0</span><span>500</span><span>2000+</span></div>
    `;
    return div;
  };
  legend.addTo(state.map);
}

// ---------- Glaciares destacados ----------
const KEY_GLACIERS = [
  { id: 'PIG',  name: 'Pine Island Glacier',  lat: -75.16, lon: -100.40, color: '#e74c3c',
    vel: '~4000 m/yr (frente)', status: 'Retroceso acelerado',
    desc: 'Glaciar de salida del Mar de Amundsen. Principal contribuyente al SLR del WAIS.',
    refs: 'Rignot et al. 2014; Joughin et al. 2014' },
  { id: 'THW',  name: 'Thwaites Glacier',     lat: -75.50, lon: -106.75, color: '#e74c3c',
    vel: '~2200 m/yr', status: 'Inestable',
    desc: '"Doomsday glacier". Pieza clave del colapso potencial del WAIS.',
    refs: 'Scambos et al. 2017 (ITGC)' },
  { id: 'TG',   name: 'Totten Glacier',       lat: -67.20,  lon:  116.50, color: '#f39c12',
    vel: '~700 m/yr', status: 'Adelgazamiento',
    desc: 'Mayor glaciar de la Antártica Oriental con base por debajo del nivel del mar.',
    refs: 'Greenbaum et al. 2015' },
  { id: 'AMR',  name: 'Amery Ice Shelf',      lat: -69.50, lon:  72.00,  color: '#3498db',
    vel: '~1200 m/yr (centro)', status: 'Equilibrio',
    desc: 'Tercera plataforma de hielo más grande; cuenca de drenaje del Lambert Glacier.',
    refs: 'Fricker et al. 2002' },
  { id: 'ROS',  name: 'Ross Ice Shelf (BIS)', lat: -82.00, lon: -180.00, color: '#3498db',
    vel: '~800 m/yr (frente)', status: 'Equilibrio',
    desc: 'Plataforma de hielo más extensa del planeta.',
    refs: 'Rignot et al. 2013' },
  { id: 'JAK',  name: 'Larsen C',             lat: -67.50, lon: -62.50,  color: '#f39c12',
    vel: '~600 m/yr', status: 'Pérdida (A-68 2017)',
    desc: 'Plataforma de hielo de la Península Antártica. Desprendimiento A-68 en 2017.',
    refs: 'Hogg & Gudmundsson 2017' },
  { id: 'DEN',  name: 'Denman Glacier',       lat: -66.50, lon:  99.00,  color: '#f39c12',
    vel: '~1000 m/yr', status: 'Cañón subglacial profundo',
    desc: 'Cañón subglacial más profundo de la Tierra (~3500 m bajo el nivel del mar).',
    refs: 'Morlighem et al. 2020 (BedMachine)' },
  { id: 'KOH',  name: 'Kohnen / EPICA-DML',   lat: -75.00, lon:    0.07,  color: '#5fb878',
    vel: '<5 m/yr', status: 'Sitio de testigo',
    desc: 'Sitio del testigo de hielo EPICA-Dronning Maud Land (740 ka).',
    refs: 'EPICA Community 2006' },
];

function renderGlaciersList() {
  const ul = document.getElementById('glaciers-list');
  ul.innerHTML = '';
  KEY_GLACIERS.forEach(g => {
    const li = document.createElement('li');
    li.dataset.id = g.id;
    li.innerHTML = `<span class="dot" style="background:${g.color}"></span>${g.name}`;
    li.addEventListener('click', () => selectGlacier(g));
    ul.appendChild(li);
  });
}

function renderGlaciersLayer() {
  if (state.glaciersLayer) {
    state.map.removeLayer(state.glaciersLayer);
    state.glaciersLayer = null;
  }
  if (!state.showGlaciers) return;
  const features = KEY_GLACIERS.map(g => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [g.lon, g.lat] },
    properties: g,
  }));
  state.glaciersLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 8, color: '#000', weight: 1.5,
      fillColor: f.properties.color, fillOpacity: 0.95,
    }),
    onEachFeature: (f, layer) => {
      layer.on('click', () => selectGlacier(f.properties));
      layer.bindTooltip(f.properties.name, { sticky: true });
    },
  }).addTo(state.map);
}

function selectGlacier(g) {
  state.selectedGlacier = g.id;
  document.querySelectorAll('#glaciers-list li').forEach(li =>
    li.classList.toggle('active', li.dataset.id === g.id));
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  document.getElementById('tab-velocidad').classList.add('with-detail');
  setTimeout(() => state.map.invalidateSize(), 50);
  document.getElementById('detail-name').textContent = g.name;
  document.getElementById('detail-meta').textContent = `${g.lat.toFixed(2)}°, ${g.lon.toFixed(2)}°`;
  document.getElementById('detail-vel').textContent = g.vel;
  document.getElementById('detail-status').textContent = g.status;
  document.getElementById('detail-desc').textContent = g.desc;
  document.getElementById('detail-refs').textContent = g.refs;
}

document.querySelector('.detail-panel .close').addEventListener('click', () => {
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('tab-velocidad').classList.remove('with-detail');
  setTimeout(() => state.map.invalidateSize(), 50);
});

// ---------- Controles ----------
document.getElementById('itslive-year').addEventListener('change', e => {
  state.itsYear = e.target.value;
  applyItsLiveLayer();
});
document.querySelectorAll('input[name="itslive-var"]').forEach(r => {
  r.addEventListener('change', e => {
    if (!e.target.checked) return;
    state.itsVar = e.target.value;
    applyItsLiveLayer();
  });
});
document.getElementById('show-glaciers').addEventListener('change', e => {
  state.showGlaciers = e.target.checked;
  renderGlaciersLayer();
});

const showCompareEl = document.getElementById('show-compare');
if (showCompareEl) {
  showCompareEl.addEventListener('change', e => {
    state.showCompare = e.target.checked;
    applyItsLiveLayer();
  });
}

// ---------- Bootstrap ----------
initMap();
renderGlaciersList();
renderGlaciersLayer();
