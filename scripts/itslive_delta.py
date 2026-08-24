"""
itslive_delta.py
================

Calcula el DELTA de velocidad glaciar entre 2 años ITS_LIVE
(default: 2022 - 2010 = 12 años de aceleración o desaceleración).

Input: 2 COGs ya procesados por itslive_to_cog.py
Output: 1 COG con delta en m/yr/año (positivo = aceleración).

Por qué este producto importa:
- Hace visible la ACELERACIÓN del flujo glaciar, no solo la velocidad estática.
- Pine Island (-100°W) y Thwaites (-107°W) deberían mostrar valores
  positivos altos (+100 a +500 m/yr más rápidos que 2010).
- La mayor parte del continente debería estar cerca de 0 (sin cambio).

Uso:
    python scripts/itslive_delta.py --early 2010 --late 2022
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "data"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--early", type=int, default=2010)
    ap.add_argument("--late", type=int, default=2022)
    ap.add_argument("--v-max", type=float, default=4500,
                    help="Velocidad maxima fisicamente plausible (m/yr). "
                         "Por encima se considera ruido de correlacion.")
    ap.add_argument("--cero-sospechoso", type=float, default=50,
                    help="Si un anio vale 0 y el otro supera este valor, "
                         "el cero es dato ausente y el par se descarta.")
    args = ap.parse_args()

    early_tif = APP_DATA / f"itslive_RGI19A_{args.early}_v_1km.tif"
    late_tif = APP_DATA / f"itslive_RGI19A_{args.late}_v_1km.tif"
    if not early_tif.exists() or not late_tif.exists():
        print(f"[ERROR] Faltan COGs: {early_tif.exists()=} {late_tif.exists()=}",
              file=sys.stderr)
        return 1

    try:
        import rasterio
        import numpy as np
    except ImportError:
        print("[ERROR] pip install rasterio numpy", file=sys.stderr)
        return 1

    print(f"[INFO] Leyendo {early_tif.name}…")
    with rasterio.open(early_tif) as src1:
        v_early = src1.read(1).astype("float32")
        nodata1 = src1.nodata
        profile = src1.profile.copy()
    print(f"[INFO] Leyendo {late_tif.name}…")
    with rasterio.open(late_tif) as src2:
        v_late = src2.read(1).astype("float32")
        nodata2 = src2.nodata
        if (src2.width, src2.height) != (profile["width"], profile["height"]):
            print(f"[ERROR] Las grillas no coinciden: "
                  f"{src1.shape if False else (profile['height'],profile['width'])} "
                  f"vs {(src2.height, src2.width)}", file=sys.stderr)
            return 1

    # ── Máscara de píxeles válidos en AMBOS rasters ──────────────────
    #
    # Además del nodata declarado (-1) hay que descartar dos artefactos que
    # ITS_LIVE deja en los mosaicos anuales y que, sin filtrar, inventan
    # aceleraciones y desaceleraciones que no existen:
    #
    # 1. CEROS DE RELLENO. El mosaico 2022 trae ~401k píxeles en 0 contra
    #    ~29k del 2010: una asimetría de 14x que delata falta de dato, no
    #    hielo estático. Un píxel que pasa de 500 m/yr a 0 en 12 años es
    #    físicamente imposible; es dato ausente. Se descarta el par cuando
    #    uno de los dos años vale 0 y el otro supera CERO_SOSPECHOSO.
    #    Los ceros con ambos años cerca de 0 SÍ se conservan: son el
    #    interior del continente, donde el hielo casi no fluye.
    #
    # 2. OUTLIERS NO FÍSICOS. Ambos mosaicos llegan a ~19.970 m/yr. El
    #    glaciar antártico más rápido (Pine Island, Thwaites) no pasa de
    #    ~4.000 m/yr, así que todo lo que supere V_MAX_FISICA es ruido de
    #    correlación, típicamente en márgenes de cizalle.
    #
    # Impacto medido en Pine Island (ventana 30 km): sin este filtro la
    # aceleración media daba +497 m/yr; con él da +241 m/yr. El 54% de la
    # ventana eran artefactos.
    #
    # OJO: los umbrales son criterio, no norma. Están acá arriba y como
    # flags CLI justamente para que se puedan discutir y ajustar.

    mask_early = (v_early != nodata1) & (v_early >= 0)
    mask_late = (v_late != nodata2) & (v_late >= 0)

    no_fisico = (v_early > args.v_max) | (v_late > args.v_max)
    cero_falso = (((v_early == 0) & (v_late > args.cero_sospechoso)) |
                  ((v_late == 0) & (v_early > args.cero_sospechoso)))

    valid = mask_early & mask_late & ~no_fisico & ~cero_falso

    n_bruto = int((mask_early & mask_late).sum())
    n_nf = int((mask_early & mask_late & no_fisico).sum())
    n_cf = int((mask_early & mask_late & cero_falso).sum())
    print(f"[FILTRO] Pares con dato en ambos años : {n_bruto:,}")
    print(f"[FILTRO]   descartados por >{args.v_max} m/yr : {n_nf:,}")
    print(f"[FILTRO]   descartados por cero de relleno: {n_cf:,}")
    print(f"[FILTRO] Pares que sobreviven         : {int(valid.sum()):,}")

    delta = np.where(valid, v_late - v_early, 0).astype("int16")
    nodata_out = -32768
    delta = np.where(valid, delta, nodata_out)

    n_valid = int(valid.sum())
    n_accel = int(((delta > 50) & (delta != nodata_out)).sum())  # >50 m/yr más rápido
    n_decel = int(((delta < -50) & (delta != nodata_out)).sum())
    print(f"[INFO] Píxeles válidos en ambos años: {n_valid:,}")
    print(f"[INFO] Aceleración fuerte (D>+50 m/yr): {n_accel:,} píxeles")
    print(f"[INFO] Desaceleración fuerte (D<-50 m/yr): {n_decel:,} píxeles")
    if n_valid:
        valid_delta = delta[delta != nodata_out]
        print(f"[INFO] Delta: media={valid_delta.mean():+.1f} m/yr, "
              f"p95={np.percentile(valid_delta, 95):+.0f}, "
              f"max={valid_delta.max():+d}")

    # Escribir COG
    out_tif = APP_DATA / f"itslive_delta_{args.early}_{args.late}_v_1km.tif"
    profile.update(dtype="int16", nodata=nodata_out, driver="COG",
                   compress="DEFLATE", predictor=2)
    with rasterio.open(out_tif, "w", **profile) as dst:
        dst.write(delta.astype("int16"), 1)
    size_mb = out_tif.stat().st_size / 1024**2
    print(f"\n[OK] {out_tif.name}: {size_mb:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
