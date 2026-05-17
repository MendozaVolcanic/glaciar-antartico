"""
sentinel1_autorift.py
=====================

Pipeline mínimo Sentinel-1 SAR → autoRIFT → mapa propio de velocidad glaciar.

Pasos
-----
1. Buscar pares S1 SLC sobre una ROI (bbox) y rango de fechas vía CDSE
   OData API: https://catalogue.dataspace.copernicus.eu/odata/v1/Products
2. Descargar dos productos con la misma órbita/track y separación temporal de
   6, 12 o 24 días (revisita Sentinel-1).
3. Correr autoRIFT (hyp3-autorift) sobre el par → produce .nc con Vx, Vy, V.
4. Reproyectar a EPSG:3031, recortar al bbox, escribir GeoTIFF en
   ../data/sentinel1/velocity_{date1}_{date2}.tif

Uso
---
    pip install hyp3-sdk asf-search rasterio
    python scripts/sentinel1_autorift.py \
        --bbox -75 -107 -74 -100 \
        --start 2024-01-01 --end 2024-03-31

Estado: stub. Requiere credenciales CDSE + posiblemente Hyp3 (ASF) para correr
autoRIFT en la nube. Documenta el camino completo y deja TODOs explícitos.
"""

from __future__ import annotations
import argparse
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("S", "W", "N", "E"),
                    required=True, help="Bounding box S W N E (grados decimales)")
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    args = ap.parse_args()

    print(f"[STUB] Buscaría pares S1 SLC en {args.bbox} entre {args.start} y {args.end}")
    print("TODO:")
    print("  1. CDSE OData query (asf_search.search_opts.bbox_to_wkt).")
    print("  2. Filtrar por relativeOrbitNumber y separación 6/12/24 días.")
    print("  3. Descargar SAFE .zip a data/sentinel1/raw/.")
    print("  4. Hyp3 job autoRIFT (hyp3-sdk) o autorift-py local con MAP_BACK init.")
    print("  5. Reproyectar a EPSG:3031, recortar y guardar GeoTIFF.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
