"""
top_acceleration_sites.py
=========================

Analiza el COG delta (v2022 - v2010) sobre los 8 glaciares clave
definidos en app/app.js (KEY_GLACIERS) y produce una tabla de
aceleración media + máxima en ventana de 30 km alrededor de cada uno.

Salida: app/data/key_glaciers_acceleration.json
        (consumido por la pestaña Sensores del visor)

Uso:
    python scripts/top_acceleration_sites.py
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DELTA_TIF = ROOT / "app" / "data" / "itslive_delta_2010_2022_v_1km.tif"
OUT_JSON = ROOT / "app" / "data" / "key_glaciers_acceleration.json"

# Mismos sitios que en app.js KEY_GLACIERS (lat lon en grados decimales)
KEY_GLACIERS = [
    {"id": "PIG", "name": "Pine Island Glacier", "lat": -75.16, "lon": -100.40},
    {"id": "THW", "name": "Thwaites Glacier",     "lat": -75.50, "lon": -106.75},
    {"id": "TG",  "name": "Totten Glacier",       "lat": -67.20, "lon":  116.50},
    {"id": "AMR", "name": "Amery Ice Shelf",      "lat": -69.50, "lon":   72.00},
    {"id": "ROS", "name": "Ross Ice Shelf (BIS)", "lat": -82.00, "lon": -180.00},
    {"id": "JAK", "name": "Larsen C",             "lat": -67.50, "lon":  -62.50},
    {"id": "DEN", "name": "Denman Glacier",       "lat": -66.50, "lon":   99.00},
    {"id": "KOH", "name": "Kohnen / EPICA-DML",   "lat": -75.00, "lon":    0.07},
]

WINDOW_KM = 30  # Ventana cuadrada alrededor del punto


def main() -> int:
    if not DELTA_TIF.exists():
        print(f"[ERROR] No existe {DELTA_TIF}", file=sys.stderr)
        return 1
    try:
        import rasterio
        from rasterio.warp import transform
        import numpy as np
    except ImportError:
        print("[ERROR] pip install rasterio numpy", file=sys.stderr)
        return 1

    with rasterio.open(DELTA_TIF) as src:
        delta = src.read(1).astype("float32")
        nodata = src.nodata if src.nodata is not None else -32768
        T = src.transform
        crs_dst = src.crs  # EPSG:3031

        # Resolución en metros del COG (1 km nominal)
        px_size_m = abs(T.a)
        win_px = int(round(WINDOW_KM * 1000 / px_size_m))
        print(f"[INFO] Delta TIF: {src.shape}, resolución {px_size_m:.0f} m, "
              f"ventana ±{win_px} px = ±{win_px*px_size_m/1000:.1f} km")

    results = []
    for g in KEY_GLACIERS:
        # Reproyectar lat/lon (EPSG:4326) a EPSG:3031
        xs, ys = transform("EPSG:4326", crs_dst, [g["lon"]], [g["lat"]])
        x, y = xs[0], ys[0]
        # Indexar en el array (rasterio: row = y, col = x)
        col, row = ~T * (x, y)
        col, row = int(round(col)), int(round(row))
        r0, r1 = max(0, row - win_px), min(delta.shape[0], row + win_px + 1)
        c0, c1 = max(0, col - win_px), min(delta.shape[1], col + win_px + 1)
        window = delta[r0:r1, c0:c1]
        valid = window[(window != nodata)]
        if valid.size == 0:
            g["mean_delta"] = None
            g["max_delta"] = None
            g["pct_accelerated"] = None
            g["status"] = "fuera de cobertura"
        else:
            # Cuantos pixeles de la ventana sobrevivieron al filtro de
            # artefactos de itslive_delta.py. Si es bajo, la media del sitio
            # se calculo sobre pocos datos y no es representativa.
            g["px_validos"] = int(valid.size)
            g["px_ventana"] = int(window.size)
            g["cobertura_pct"] = round(100 * valid.size / window.size, 1)
            g["mean_delta"] = round(float(valid.mean()), 1)
            g["max_delta"] = int(valid.max())
            g["min_delta"] = int(valid.min())
            g["p95_delta"] = int(np.percentile(valid, 95))
            n_total = valid.size
            n_accel = int((valid > 50).sum())
            g["pct_accelerated"] = round(100 * n_accel / n_total, 1)
            if g["cobertura_pct"] < 50:
                g["status"] = "Cobertura insuficiente"
            elif g["mean_delta"] > 30:
                g["status"] = "Aceleración fuerte"
            elif g["mean_delta"] > 10:
                g["status"] = "Aceleración moderada"
            elif g["mean_delta"] < -30:
                g["status"] = "Desaceleración fuerte"
            elif g["mean_delta"] < -10:
                g["status"] = "Desaceleración moderada"
            else:
                g["status"] = "Estable"
        results.append(g)

    # Ordenar por mean_delta descendente (más aceleración primero)
    results.sort(key=lambda g: -(g.get("mean_delta") or -9999))

    print("\n[RESULTADOS]")
    print(f"{'Glaciar':<28} {'D media':>10} {'D max':>8} {'% accel':>8} {'cob%':>6} Estado")
    for g in results:
        md = g.get('mean_delta')
        mx = g.get('max_delta')
        pa = g.get('pct_accelerated')
        print(f"{g['name'][:28]:<28} "
              f"{md if md is not None else '—':>10} "
              f"{mx if mx is not None else '—':>8} "
              f"{pa if pa is not None else '—':>8} "
              f"{g.get('cobertura_pct','—'):>6}  {g.get('status','')}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({
        "generated_from": "itslive_delta_2010_2022_v_1km.tif",
        "window_km": WINDOW_KM,
        "metric_units": "m/yr (positivo = aceleración)",
        "ADVERTENCIA": (
            "PRODUCTO PRELIMINAR, NO CITAR. Restar dos mosaicos anuales de "
            "ITS_LIVE no es un metodo validado de medicion de aceleracion: "
            "2010 se apoya en Landsat 7 (SLC-off) y 2022 en Landsat 8/9 y "
            "Sentinel, con coberturas de 7,1M y 13,2M pixeles. El delta "
            "resultante da una media continental negativa (~-33 m/yr) y 6 "
            "veces mas pixeles desacelerando que acelerando, lo que "
            "contradice el consenso y apunta a un sesgo sistematico entre "
            "sensores todavia no corregido. Los valores por sitio sirven "
            "para comparar entre sitios, no como magnitudes absolutas."
        ),
        "filtros_aplicados": (
            "Se descartan pares con velocidad >4500 m/yr (ruido de "
            "correlacion) y ceros de relleno (un anio en 0 con el otro "
            ">50 m/yr). Ver scripts/itslive_delta.py."
        ),
        "sites": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[OK] {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
