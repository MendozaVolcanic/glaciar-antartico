# Metodología — Glaciar Antártico

Notas técnicas para reproducir cada pestaña del visor. Fechas y versiones a 2026-05.

## 1. Velocidades (ITS_LIVE)

### Producto
- **ITS_LIVE v2 Antarctic Mosaics** (Gardner et al., 2018; v2 2023).
- Resolución: 240 m, EPSG:3031.
- Cobertura: 1985 → presente − 2; mosaico compuesto multi-año (`0000`).
- Variables: `v` (magnitud), `vx`, `vy` (componentes en marco polar), `v_err`.

### Pipeline
1. `scripts/fetch_itslive.py --years 0000 2022 --vars v` baja COGs de S3.
2. Colorize con viridis (magnitud) o RdBu (componentes).
3. `gdal2tiles.py --xyz` → tiles XYZ en `app/data/tiles/itslive_{year}_{var}/`.
4. El dashboard apunta a esa ruta vía `ITSLIVE_TILE_TEMPLATE` en `app.js`.

### Validación
- Comparar con valores publicados para Pine Island (~4000 m/yr frente),
  Thwaites (~2200 m/yr), Lambert (~1200 m/yr centro).
- Usar `app/data/glaciers_keypoints.geojson` (a generar) con valores de
  referencia.

## 2. Sensores multi-fuente

### 2.1 Sentinel-1 SAR (autoRIFT)
- Par de SLC en órbita ascendente o descendente con separación 6/12/24 días.
- Procesamiento: `autoRIFT` (Lei et al. 2021) sobre IW SLC co-registrados.
- Alternativa nube: Hyp3 (ASF DAAC) job `INSAR_GAMMA` o `AUTORIFT`.

### 2.2 Sentinel-2 (líneas de costa)
- Bandas 4/3/2 + máscara NDSI.
- Vectorizar el contorno donde el hielo se desprende → series temporales
  multitemporales del frente del glaciar.

### 2.3 Sentinel-3 SLSTR (LST + albedo)
- Producto L1B `S3*_SL_1_RBT__*` → calibrar TIR (S8, S9) a LST con split-window.
- Albedo: NIR (S5) + corrección BRDF (Ross-Thick Li-Sparse).

### 2.4 ICESat-2 (dh/dt)
- ATL06 (along-track) y ATL11 (cross-over).
- `icepyx` para queries; `slidem` (Smith et al. 2020) para `dh/dt`.

## 3. Evolución histórica

- **LGM (21 ka):** RAISED Consortium (Bentley et al. 2014).
- **Eemian (125 ka):** Sutter et al. 2016 (PISM).
- **MIS-31 (1.07 Ma):** modelado especulativo, referencias en revisión.

Salida esperada: capa GeoJSON multi-features con campo `age_ka` para animar
con un slider temporal.

## 4. Predicción

- **ISMIP6-Antarctica** (Seroussi et al. 2020, Edwards et al. 2021).
- Ensemble de ~15 modelos de hielo forzados con ~4 GCM CMIP6.
- Salidas crudas: <https://theghub.org/groups/ismip6>.
- Producto deseable: cinco "líneas de costa" 2100 (mínimo, mediana, máximo, +
  cuantiles 25/75) por escenario SSP, en GeoJSON EPSG:3031.

## CRS y convenciones
- Todo el proyecto usa EPSG:3031 (Antarctic Polar Stereographic, true scale −71°).
- Origen del tilegrid: ver `ANTARCTIC_CRS_BOUNDS` en `app/app.js` (alineado con
  SCAR Antarctic Digital Database).
