# Glaciar Antártico

Herramienta para medir, modelar y proyectar la dinámica del hielo antártico a partir de teledetección satelital.

🌐 **Dashboard público:** https://mendozavolcanic.github.io/glaciar-antartico/ *(GitHub Pages, redeploy automático en cada push a `main`)*

Proyecto 2 del documento `Visor Antartico.docx`. Independiente del visor de contextos geológicos antárticos (Proyecto 1), aunque comparte el sistema de coordenadas polar EPSG:3031 y puede integrarse como capa adicional a futuro.

**Suite Antártica:**
- 🌐 [contextos-geologicos](https://mendozavolcanic.github.io/contextos-geologicos/) — Proyecto 1: visor de 9 SCAR Frameworks + 121 geositios (ASPAs + SCAR + propuestos bibliométrica) + BedMap UI
- 🧊 **glaciar-antartico** *(este repo)* — Proyecto 2: velocidades ITS_LIVE, sensores multi-fuente, predicción IPCC

## Objetivos

1. **Velocidades de flujo glaciar** desde imágenes Copernicus (Sentinel-1 SAR, Sentinel-2 óptico) usando feature/offset tracking.
2. **Modelos de avance y retroceso** de glaciares y plataformas de hielo a partir de series temporales.
3. **Reconstrucción de glaciaciones pasadas** — evolución del hielo continental en el Cuaternario.
4. **Análisis multi-sensor** — Sentinel-3 (SLSTR/OLCI: temperatura superficial, albedo), ICESat-2 (altimetría láser, espesor), CryoSat-2 (radar altimétrico).
5. **Predicción de evolución** bajo escenarios climáticos IPCC (SSP1-2.6, SSP2-4.5, SSP5-8.5).

## Stack tentativo

| Componente | Herramientas candidatas |
|---|---|
| Acceso a datos | Copernicus Data Space Ecosystem (CDSE) API, NASA Earthdata, NSIDC |
| Procesamiento SAR | SNAP, sarsen, hyp3-autoRIFT |
| Feature tracking | autoRIFT, ITS_LIVE (referencia / validación) |
| Geoespacial | xarray, rioxarray, geopandas, dask |
| Modelado glaciar | OGGM, PISM (referencia), o aproximaciones ML |
| Visualización | CesiumJS (consistente con Contextos geologicos), Leaflet EPSG:3031, deck.gl |
| Pipeline | Python 3.12, prefect/snakemake opcional |

## Estructura

```
Glaciar Antartico/
├── app/          # Dashboard de visualización (web)
├── scripts/      # Pipelines de descarga y procesamiento
├── data/         # GeoTIFF/NetCDF/Zarr (gitignored si > 100 MB)
└── docs/
    ├── fuentes_datos.md
    ├── metodologia.md
    └── bibliografia/
```

## Fuentes de datos (a confirmar)

- **ITS_LIVE** (NASA/JPL) — mosaicos pre-computados de velocidad glaciar, base de comparación.
- **MEaSUREs Antarctic Ice Velocity Map** (Rignot et al.) — referencia histórica.
- **BedMachine Antarctica v3** / **BedMap3** — topografía subglacial.
- **Sentinel-1 GRD/SLC** — feature tracking propio.
- **Sentinel-3 SLSTR** — temperatura superficial, albedo.
- **ICESat-2 ATL06/ATL11** — cambios de elevación.
- **IPCC AR6 CMIP6** — forzantes climáticos para predicción.

## Relación con otros proyectos del repo

- **`../Contextos geologicos/`** comparte EPSG:3031 y el patrón Leaflet + Cesium. Las velocidades de flujo y los polígonos de retroceso glaciar podrían sumarse como pestaña adicional al visor maestro.
- **`../Mapas 3D/`** (pipeline QGIS → Blender) sirve para renders cartográficos del basamento BedMap3/4 sin hielo, útil como capa contextual.

## Estado

🟢 Dashboard navegable construido (`app/index.html`) — Leaflet EPSG:3031 + 5 pestañas + 8 glaciares clave con panel de detalle.

🟡 Pendiente: bajar los mosaicos ITS_LIVE para que la capa de velocidad renderice. Estimación de espacio (verificado mayo 2026):

| Producto | Cobertura | Tamaño |
|---|---|---|
| ITS_LIVE v2 Antártico completo | Todos los años (1985..año−2) × todas las variables (v, vx, vy, errores) | **~104 GB** |
| Mosaico anual solo `v` (un año) | 1 año, magnitud | ~500 MB – 1 GB |
| Mosaico compuesto solo `v` | Multi-año, magnitud | 1 – 3 GB |
| Set "razonable" para el dashboard | Compuesto + 5 años recientes, solo `v` | ~4 – 7 GB |
| Set ampliado con componentes | + vx, vy de 5 años | ~12 – 20 GB |

**Recomendado para empezar**: bajar solo compuesto + 2-3 años recientes (`--years 0000 2022 2021 --vars v`) → ~3 GB.

## Próximo paso

1. `python scripts/fetch_itslive.py --years 0000 2022 --vars v` (≈ 2 GB).
2. Verificar que el dashboard renderice los tiles locales.
3. Encadenar pipeline Sentinel-1 + autoRIFT sobre Pine Island para validar la línea base.
