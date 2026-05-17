"""
fetch_itslive.py
================

Descarga mosaicos de velocidad ITS_LIVE (NASA/JPL) para la Antártica y los
prepara para servirse como tiles XYZ desde el dashboard local.

ITS_LIVE (verificado mayo 2026)
-------------------------------
- Producto: NSIDC-0731 v2 "MEaSUREs ITS_LIVE Regional Glacier and Ice Sheet
  Surface Velocities" — la región antártica es uno de los 8 mosaicos.
- Formato: NetCDF *o* Cloud-Optimized GeoTIFF (COG), EPSG:3031, 240 m.
- Endpoint S3 público (AWS Open Data, sin auth):
    s3://its-live-data/velocity_mosaic/v2/static/cog/
    https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2/static/cog/
- Cobertura temporal: anuales 1985..(año actual − 2) + 1 mosaico compuesto.
- **Tamaño**: ~104 GB el set antártico completo (todas las variables, todos
  los años). Por archivo: 5 MB a 15 GB. Un mosaico compuesto solo de `v`
  (magnitud) está típicamente en el rango de 1-3 GB; un mosaico anual `v`
  ~500 MB - 1 GB.
- Doc oficial: https://nsidc.org/data/nsidc-0731/versions/2

Lo que hace este script
-----------------------
1. Para cada año pedido descarga los COGs `v`, `vx`, `vy` (magnitud y
   componentes), si no existen ya en data/.
2. Aplica un colormap (viridis para magnitud, RdBu para componentes) y
   produce tiles XYZ con `gdal2tiles.py` en EPSG:3031:
       data/tiles/itslive_{year}_{var}/{z}/{x}/{y}.png

Uso
---
    pip install requests rasterio rio-cogeo
    python scripts/fetch_itslive.py --years 0000 2022 2021 --vars v
    # Luego sirve la app:
    cd app && python -m http.server 8001  # → http://localhost:8001

Notas
-----
- Si NSIDC publica un Titiler oficial (`/api/itslive/v2/tiles/...`) reemplazar
  `ITSLIVE_TILE_TEMPLATE` en app/app.js para evitar la generación local.
- Para velocidades del último año (rolling window mensual) usar el producto
  Granules ITS_LIVE en lugar de los mosaicos anuales.
"""

from __future__ import annotations
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
TILES_DIR = ROOT / "app" / "data" / "tiles"

S3_BASE = "https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2/static/cog"
# Patrón típico del nombre de archivo (verificar con el dataset real):
#   ANT_G0240_{YYYY}.nc   o   ANT_G0240_{YYYY}_{var}.tif
FILE_TEMPLATE = "ANT_G0240_{year}_{var}.tif"


def download(url: str, dest: Path) -> bool:
    try:
        import requests
    except ImportError:
        print("[ERROR] Falta `requests`. pip install requests", file=sys.stderr)
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[SKIP] Ya existe {dest.name}")
        return True
    try:
        with requests.get(url, stream=True, timeout=300) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            done = 0
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        print(f"\r  {dest.name}: {100*done/total:5.1f}%",
                              end="", flush=True)
            print()
        return True
    except Exception as e:
        print(f"\n[WARN] Falló {url}: {e}", file=sys.stderr)
        if dest.exists():
            dest.unlink()
        return False


def colorize(in_tif: Path, out_tif: Path, var: str) -> bool:
    """Aplica un colormap apropiado a la variable."""
    try:
        import rasterio
        from rasterio.enums import ColorInterp
        import numpy as np
        import matplotlib.cm as cm
    except ImportError:
        print("[ERROR] Falta rasterio + matplotlib + numpy.", file=sys.stderr)
        return False
    try:
        with rasterio.open(in_tif) as src:
            arr = src.read(1, masked=True).astype("float32")
            profile = src.profile
        if var == "v":
            vmin, vmax = 0.0, 2000.0
            cmap = cm.get_cmap("viridis")
        else:  # vx, vy: componentes (puede ser negativa)
            vmin, vmax = -2000.0, 2000.0
            cmap = cm.get_cmap("RdBu_r")
        norm = (np.clip(arr, vmin, vmax) - vmin) / (vmax - vmin)
        rgba = (cmap(norm) * 255).astype("uint8")
        rgba[..., 3] = np.where(arr.mask, 0, 220)  # alpha
        # Escribir como RGBA GeoTIFF
        profile.update(count=4, dtype="uint8", photometric="RGB",
                       nodata=None, compress="DEFLATE")
        out_tif.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out_tif, "w", **profile) as dst:
            for i in range(4):
                dst.write(rgba[..., i], i + 1)
            dst.colorinterp = (ColorInterp.red, ColorInterp.green,
                               ColorInterp.blue, ColorInterp.alpha)
        return True
    except Exception as e:
        print(f"[ERROR] Colorize falló: {e}", file=sys.stderr)
        return False


def tile_it(rgba_tif: Path, out_dir: Path, zoom: str = "0-6") -> bool:
    if shutil.which("gdal2tiles.py") is None and shutil.which("gdal2tiles") is None:
        print("[ERROR] gdal2tiles no está en PATH. Instala GDAL.", file=sys.stderr)
        return False
    bin_name = "gdal2tiles.py" if shutil.which("gdal2tiles.py") else "gdal2tiles"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([bin_name, "-z", zoom, "-w", "none", "-r", "bilinear",
                        "--xyz", str(rgba_tif), str(out_dir)],
                       check=True)
        print(f"[OK] Tiles en {out_dir}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] gdal2tiles falló: {e}", file=sys.stderr)
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--years", nargs="+", default=["0000"],
                    help="Año(s) a bajar. '0000' = compuesto multi-año.")
    ap.add_argument("--vars", nargs="+", default=["v"], choices=["v", "vx", "vy"])
    ap.add_argument("--zoom", default="0-6")
    args = ap.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    any_ok = False
    for year in args.years:
        for var in args.vars:
            fname = FILE_TEMPLATE.format(year=year, var=var)
            url = f"{S3_BASE}/{fname}"
            raw = DATA_DIR / fname
            if not download(url, raw):
                continue
            rgba = DATA_DIR / fname.replace(".tif", "_rgba.tif")
            if not colorize(raw, rgba, var):
                continue
            tiles_dir = TILES_DIR / f"itslive_{year}_{var}"
            if tile_it(rgba, tiles_dir, args.zoom):
                any_ok = True

    if not any_ok:
        print("\n[!] Nada se generó. Verifica conexión y dependencias.",
              file=sys.stderr)
        return 1
    print("\n[OK] Done.")
    print("Edita app/app.js → ITSLIVE_TILE_TEMPLATE para apuntar a:")
    print("  data/tiles/itslive_{year}_{var}/{z}/{x}/{y}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
