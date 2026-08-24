# Traspaso — Glaciar Antártico

**De:** Nicolás Mendoza · **A:** Felipe Fuentes Carrasco · **Fecha:** 2026-08-24

## 1. Qué es

Visor de dinámica glaciar antártica desde teledetección: velocidades de flujo ITS_LIVE
servidas como COG, comparación entre años, sensores multi-fuente y proyecciones IPCC.
Todo en proyección polar EPSG:3031.

🌐 https://mendozavolcanic.github.io/glaciar-antartico/

Es el Proyecto 2 del documento `Visor Antartico.docx`. El Proyecto 1 es
[contextos-geologicos](https://github.com/MendozaVolcanic/contextos-geologicos), que cubre
los 9 SCAR Frameworks y los geositios antárticos. Comparten CRS y podrían integrarse,
pero hoy son independientes.

## 2. Qué hay funcionando

| Pestaña | Estado |
|---|---|
| Mapa velocidades | ✅ COG ITS_LIVE 2010 y 2022 a 1 km, slider de año, modo comparación |
| Δ Aceleración 2010→2022 | ⚠️ Funciona pero **es preliminar** — ver §3 |
| Sensores | ✅ Tabla multi-fuente + aceleración por glaciar clave |
| Histórico / Predicción | ✅ Chart.js con datos IPCC AR6 |

Pipeline reproducible en `scripts/`:

```
fetch_itslive.py          # descarga mosaicos ITS_LIVE (NetCDF, 5 MB a 21 GB)
itslive_to_cog.py         # NetCDF -> COG 1 km, EPSG:3031
itslive_delta.py          # resta 2 años -> COG de aceleración
top_acceleration_sites.py # estadísticas por glaciar clave -> JSON
sentinel1_autorift.py     # feature tracking S1 (en desarrollo)
```

## 3. ⚠️ El producto Δ Aceleración es preliminar — LEER

Esto es lo más importante del traspaso. **No cites los números de aceleración y no los
uses como magnitudes absolutas.**

### Lo que se corrigió en esta entrega

El delta se calculaba sin filtrar dos artefactos de los mosaicos ITS_LIVE:

1. **Ceros de relleno.** El mosaico 2022 trae ~401.000 píxeles en 0 contra ~29.000 del
   2010: una asimetría de 14× que delata dato ausente, no hielo estático. Donde 2022
   valía 0 y 2010 tenía flujo, el delta inventaba una desaceleración. Así aparecía un
   `min_delta` de **−15.360 m/yr** en Pine Island, que no es un glaciar frenando sino un
   píxel vacío.
2. **Outliers no físicos.** Ambos mosaicos llegan a ~19.970 m/yr. Ningún glaciar antártico
   pasa de ~4.500 m/yr; el resto es ruido de correlación en márgenes de cizalle, y cae
   justo en las zonas rápidas que interesan.

Impacto: la aceleración media de **Pine Island pasó de +483,9 a +229,5 m/yr**. El 54% de
la ventana de 30 km eran artefactos. Los umbrales viven en `itslive_delta.py` como flags
CLI (`--v-max`, `--cero-sospechoso`) justamente para que puedas discutirlos.

### Lo que sigue sin resolverse — y es tuyo decidirlo

Ya filtrado, **el delta sigue dando una media continental de −32,7 m/yr y seis veces más
píxeles desacelerando que acelerando** (1.127.029 contra 189.321). Eso contradice el
consenso sobre la Antártica Occidental y contradice lo que el propio docstring del script
anticipaba: "la mayor parte del continente debería estar cerca de 0".

La causa probable es que **restar dos mosaicos anuales de ITS_LIVE no es un método
validado de medir aceleración**:

- 2010 se apoya principalmente en Landsat 7 con el SLC averiado; 2022 en Landsat 8/9 más
  Sentinel-1/2. Son cadenas de procesamiento distintas con sesgos distintos.
- Las coberturas no son comparables: 7,07 M píxeles válidos en 2010 contra 13,17 M en
  2022. La intersección está sesgada hacia las zonas rápidas, que son donde el feature
  tracking funcionaba en 2010.

**Caminos posibles**, en orden de rigor:

1. Usar los productos de **tendencia** de ITS_LIVE (`dv/dt`) en vez de restar dos años.
   Es lo que recomienda el propio equipo de ITS_LIVE y elimina el problema de raíz.
2. Restar años del **mismo sensor** (por ejemplo 2018 contra 2022, ambos con Sentinel-1),
   aceptando una ventana temporal más corta.
3. Calcular y corregir el sesgo sobre zonas de referencia estables (interior del
   continente, donde la velocidad real es ~0) antes de interpretar el resto.

Mientras no se resuelva, la UI muestra la advertencia y el JSON la lleva en el campo
`ADVERTENCIA`. No las saques sin haber cerrado el tema.

### Cobertura por sitio

`key_glaciers_acceleration.json` ahora reporta `cobertura_pct` por glaciar. Los sitios
bajo 50% se marcan como "Cobertura insuficiente" — hoy Pine Island (34,5%). Larsen C y
Kohnen quedan fuera de cobertura del mosaico.

## 4. Cómo levantarlo

Visor (estático, sin build):

```bash
python -m http.server 8080
```

Sirviendo desde `app/`. Deploy automático a GitHub Pages en cada push a `main`.

Pipeline de datos:

```bash
pip install -r requirements.txt
python scripts/itslive_delta.py --early 2010 --late 2022
python scripts/top_acceleration_sites.py
```

`rasterio` es la dependencia pesada. En Windows conviene instalarlo desde conda-forge.

## 5. Datos

Los COG de 1 km viven en `app/data/` y **sí** están versionados (~30 MB en total), para
que GitHub Pages los sirva sin regenerar nada. Los NetCDF crudos de ITS_LIVE no: van de
5 MB a 21 GB por archivo y están gitignored. Se bajan con `scripts/fetch_itslive.py`.

## 6. Detalles menores pendientes

- El panel de estado muestra "COG 1km (0 KB)" para la capa delta: el cálculo de `sizeKB`
  no recibe `content-length` en esa ruta. Cosmético.
- `sentinel1_autorift.py` está esbozado pero no integrado al visor.
- La pestaña Predicción usa curvas IPCC AR6 genéricas, no un modelo propio corrido sobre
  estos datos.

## 7. Pendientes de la auditoría de código

Auditoría del 2026-08-24 con seis revisores. Informe completo en el repo maestro:
[`contextos-geologicos/reviews/code-review/2026-08-24_CODE-REVIEW-REPORT.md`](https://github.com/MendozaVolcanic/contextos-geologicos/blob/main/reviews/code-review/2026-08-24_CODE-REVIEW-REPORT.md).

**Ya corregido:** `fetch_itslive.py` se caía al redirigir la salida a un archivo (cp1252 en
Windows), más los dos filtros de artefactos del §3.

**Lo que queda abierto en este repo:**

### 7.1 · Dos problemas de muestreo que necesitan tu criterio

**Un solo umbral fijo para regímenes de hielo incompatibles** — `top_acceleration_sites.py:95`

El clasificador aplica los mismos cortes absolutos (±30 y ±10 m/yr) a los ocho sitios. Pero
`KEY_GLACIERS` mezcla tres cosas que no son comparables:

- glaciares de descarga rápidos y aterrizados (Pine Island, Thwaites, Totten, Denman),
- plataformas flotantes (Amery, Ross, Larsen C),
- y un sitio de divisoria interior (Kohnen / EPICA-DML), elegido justamente por su flujo
  casi nulo y muy estable, del orden de 1-2 m/yr.

30 m/yr es alrededor del 1% de la velocidad de Pine Island —señal plausible— pero **excede
la velocidad total de Kohnen**, donde solo puede ser ruido. Los dos reciben la misma
etiqueta cualitativa en la tabla que consume la pestaña Sensores.

Lo razonable es normalizar por la velocidad base local (cambio porcentual respecto al año
temprano en esa ventana) en vez de, o además de, un corte absoluto en m/yr; y separar
plataformas, hielo aterrizado y divisoria en escalas distintas — o al menos marcar Kohnen
como sitio de referencia de estabilidad y no rankearlo junto a los glaciares rápidos.

**Una ventana de 30 km rotulada como la plataforma completa** — `top_acceleration_sites.py:37`

`WINDOW_KM = 30` da un cuadro de ~60×60 km, unos 3.600 km². Pero la salida rotula esos
números como "Ross Ice Shelf", "Amery Ice Shelf" y "Larsen C", que miden ~500.000, ~60.000
y ~50.000 km² respectivamente. En el caso de Ross, el número describe **menos del 1%** de
la plataforma y se lee como si la caracterizara entera.

Dos salidas: enmascarar con el polígono real de cada rasgo (hay outlines de plataformas
disponibles), o cambiar el rótulo para que diga explícitamente que es una ventana local
alrededor de un punto representativo, no el estadístico de la plataforma.

### 7.2 · Menores

- `top_acceleration_sites.py:110` — `-(g.get("mean_delta") or -9999)`: en Python `0.0` es
  falsy, así que un sitio con aceleración media exactamente 0,0 se ordenaría al final como
  si fuera el más desacelerado. Bug latente: hoy ningún sitio da 0,0 exacto. El arreglo es
  comparar con `is not None`.
- `requirements.txt` declara solo cotas inferiores (`>=`) sin lockfile. `rasterio`,
  `rioxarray` y `xarray` han roto API entre versiones mayores, así que una instalación
  limpia dentro de un año puede no reproducir los COG actuales. Conviene commitear un
  `pip freeze`.
- `app/app.js:290` — `itsLayer2` y `showCompare` se agregan al objeto `state` fuera de su
  definición inicial, así que no se ven al leer el estado.
- El panel muestra "COG 1km (0 KB)" en la capa delta: `sizeKB` no recibe `content-length`
  en esa ruta. Cosmético.
- `sentinel1_autorift.py` está esbozado pero no integrado al visor.

### 7.3 · Riesgo no verificado

No se comprobó que las coordenadas de `KEY_GLACIERS` caigan sobre el tronco rápido de cada
glaciar y no sobre un margen o la línea de conexión a tierra. Con coberturas de ventana tan
dispares entre sitios (Pine Island quedó en 34,5%), vale la pena revisarlo antes de
interpretar cualquier número.


## 8. Próximos pasos sugeridos

1. **Cerrar el tema del §3.** Todo lo demás en aceleración depende de esa decisión.
2. Integrar el feature tracking propio (autoRIFT sobre Sentinel-1) para no depender solo
   de ITS_LIVE.
3. Sumar ICESat-2 para espesor, que es lo que falta para hablar de balance de masa y no
   solo de velocidad.
4. Evaluar integrar como capa dentro del visor de contextos antárticos (Proyecto 1).
