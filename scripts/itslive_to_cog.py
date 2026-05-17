"""
itslive_to_cog.py
=================

Toma 1 mosaico anual ITS_LIVE Antarctic (RGI19A, ~8.6 GB NetCDF) y produce
un COG GeoTIFF DOWNSAMPLEADO con la variable `v` (magnitud de velocidad
glaciar) servible desde GitHub Pages.

Input
-----
- data/raw/ITS_LIVE_RGI19A_<year>_v02.nc  (NetCDF nativo, 120 m, EPSG:3031)

Output
------
- app/data/itslive_RGI19A_<year>_v_1km.tif  (~50-150 MB, COG)
  Resolución 1 km (8× downsample desde 120 m).
  Solo variable `v` (magnitud).

Uso
---
    pip install xarray rioxarray netCDF4 rasterio
    python scripts/itslive_to_cog.py --year 2022
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "app" / "data"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=2022)
    ap.add_argument("--downsample", type=int, default=8,
                    help="Factor de downsample (default 8 → 120m → 960m)")
    args = ap.parse_args()

    nc_path = RAW_DIR / f"ITS_LIVE_RGI19A_{args.year}_v02.nc"
    if not nc_path.exists():
        print(f"[ERROR] No existe {nc_path}", file=sys.stderr)
        return 1

    try:
        import xarray as xr
        import rioxarray  # noqa
        import numpy as np
    except ImportError:
        print("[ERROR] pip install xarray rioxarray netCDF4 rasterio",
              file=sys.stderr)
        return 1

    print(f"[INFO] Abriendo {nc_path.name} "
          f"({nc_path.stat().st_size / 1024**3:.2f} GB)…")
    ds = xr.open_dataset(nc_path, chunks={"x": 1024, "y": 1024})
    print(f"[INFO] Variables: {list(ds.data_vars.keys())[:10]}")
    print(f"[INFO] Dimensiones: {dict(ds.sizes)}")

    # Variable v (magnitud de velocidad, m/yr)
    if "v" not in ds.data_vars:
        print(f"[ERROR] Variable 'v' no encontrada. Variables: "
              f"{list(ds.data_vars.keys())}", file=sys.stderr)
        return 1

    da = ds["v"]
    print(f"[INFO] v shape original: {da.shape}, dtype: {da.dtype}")

    # Downsample con coarsen + mean
    kw = {dim: args.downsample for dim in da.dims if dim in ("x", "y")}
    da_small = da.coarsen(boundary="trim", **kw).mean()
    print(f"[INFO] v shape downsampled: {da_small.shape}")

    # CRS: ITS_LIVE es EPSG:3031
    if not da_small.rio.crs:
        da_small = da_small.rio.write_crs("EPSG:3031")

    # Convertir a int16: velocidad en m/yr (0 a 8000 max), nodata = -1
    arr = da_small.values
    nodata = -1
    arr_int = np.where(np.isnan(arr) | (arr < 0), nodata,
                       np.clip(arr, 0, 32767)).astype("int16")
    da_int = da_small.copy(data=arr_int).rio.write_nodata(nodata)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_tif = OUT_DIR / f"itslive_RGI19A_{args.year}_v_1km.tif"
    da_int.rio.to_raster(
        out_tif,
        driver="COG",
        compress="DEFLATE",
        predictor=2,
        dtype="int16",
    )
    size_mb = out_tif.stat().st_size / 1024**2
    print(f"[OK] {out_tif.name}: {size_mb:.1f} MB")
    print(f"     Resolución: ~{120 * args.downsample} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
