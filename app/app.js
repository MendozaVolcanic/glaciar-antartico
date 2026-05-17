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

// ITS_LIVE tile endpoints. Los mosaicos anuales viven en:
//   https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2/static/...
// Para servirlos como tiles XYZ usamos el endpoint Titiler-ITS_LIVE
// (https://nsidc.org/data/nsidc-0731/versions/2) cuando esté disponible;
// si no, el script scripts/fetch_itslive.py baja el NetCDF y lo tila local.
const ITSLIVE_TILE_TEMPLATE =
  'https://nsidc.org/api/itslive/v2/tiles/antarctic/{year}/{var}/{z}/{x}/{y}.png';

function buildItsLiveUrl(year, varName) {
  return ITSLIVE_TILE_TEMPLATE
    .replace('{year}', year)
    .replace('{var}', varName);
}

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
  });
});

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

function applyItsLiveLayer() {
  if (state.itsLayer) state.map.removeLayer(state.itsLayer);
  const url = buildItsLiveUrl(state.itsYear, state.itsVar);
  state.itsLayer = L.tileLayer(url, {
    opacity: 0.78,
    attribution: 'ITS_LIVE · NASA MEaSUREs (Gardner et al.)',
    errorTileUrl: '',
  });
  let errors = 0;
  state.itsLayer.on('tileerror', () => {
    errors++;
    if (errors === 1) {
      document.getElementById('status').innerHTML =
        '⚠ Tiles remotas no disponibles.<br>' +
        'Corre <code>python scripts/fetch_itslive.py</code> para generar local.';
    }
  });
  state.itsLayer.on('load', () => {
    const lbl = state.itsYear === '0000' ? 'compuesto' : state.itsYear;
    document.getElementById('status').textContent = `ITS_LIVE ${state.itsVar} · ${lbl}`;
  });
  state.itsLayer.addTo(state.map);
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

// ---------- Bootstrap ----------
initMap();
renderGlaciersList();
renderGlaciersLayer();
