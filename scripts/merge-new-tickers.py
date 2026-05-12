"""
merge-new-tickers.py — H1 v2 data layer

Lee el CSV viejo de v1 (32 tickers, fecha YYYY-MM) y la fuente de estudios
(53 tickers, fecha YYYY-MM-DD) y emite mercantil_retornos_backfilled.csv
extendido con 5 columnas nuevas: USMV, SPLV, SCHD, NOBL, SHY.

NaN-padding aplicado donde un ticker no tiene historia. La imputacion con
proxy se hace en build-data.mjs (no aqui).

Aligned a la grilla de v1 (2006-01 -> 2026-04, 244 meses).
"""
from __future__ import annotations
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V1_CSV   = ROOT / "data" / "mercantil_retornos_backfilled.csv"
EST_CSV  = ROOT.parent / "ESTUDIOS A LA MEDIDA" / "data" / "estudios_retornos.csv"
OUT_CSV  = ROOT / "data" / "mercantil_retornos_backfilled.csv"  # in-place

NEW_TICKERS = ["USMV", "SPLV", "SCHD", "NOBL", "SHY"]

def yyyymm(date_str: str) -> str:
    """Normaliza 'YYYY-MM' o 'YYYY-MM-DD' a 'YYYY-MM'."""
    return date_str[:7]

def main():
    # 1. Read v1 CSV
    with open(V1_CSV, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        v1_header = next(reader)
        v1_rows = list(reader)
    print(f"v1: {len(v1_rows)} rows, header[0]={v1_header[0]!r}, {len(v1_header)-1} tickers")

    # 2. Read estudios CSV
    with open(EST_CSV, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        est_header = next(reader)
        est_rows = list(reader)
    print(f"estudios: {len(est_rows)} rows, header[0]={est_header[0]!r}, {len(est_header)-1} tickers")

    # 3. Locate columns for new tickers in estudios
    new_col_idx = {}
    for t in NEW_TICKERS:
        if t not in est_header:
            raise RuntimeError(f"ticker {t} no esta en estudios CSV: {est_header}")
        new_col_idx[t] = est_header.index(t)
    print(f"col idx en estudios: {new_col_idx}")

    # 4. Index estudios by YYYY-MM
    est_by_date = {}
    for row in est_rows:
        d = yyyymm(row[0])
        est_by_date[d] = row

    # 5. Build merged rows aligned to v1 dates
    out_rows = []
    matched = 0
    nan_filled = 0
    for v1_row in v1_rows:
        date = v1_row[0]  # YYYY-MM
        est_row = est_by_date.get(date)
        new_vals = []
        for t in NEW_TICKERS:
            if est_row is None:
                new_vals.append("")  # empty = NaN
            else:
                v = est_row[new_col_idx[t]]
                new_vals.append(v if v.strip() else "")
            if est_row is None or not new_vals[-1].strip():
                nan_filled += 1
        if est_row is not None:
            matched += 1
        out_rows.append(v1_row + new_vals)

    print(f"Matched {matched}/{len(v1_rows)} dates; NaN cells filled: {nan_filled}")

    # 6. Emit
    out_header = v1_header + NEW_TICKERS
    with open(OUT_CSV, "w", encoding="utf-8", newline="\n") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(out_header)
        for row in out_rows:
            writer.writerow(row)

    print(f"Wrote {OUT_CSV}")
    print(f"  rows: {len(out_rows)}, cols: {len(out_header)} (was {len(v1_header)})")

    # 7. Stats per new ticker
    for t in NEW_TICKERS:
        j = out_header.index(t)
        n_valid = sum(1 for r in out_rows if r[j].strip() not in ("", "nan", "NaN"))
        first_valid = next((r[0] for r in out_rows if r[j].strip() not in ("", "nan", "NaN")), None)
        print(f"  {t}: {n_valid} valid months, first valid date: {first_valid}")


if __name__ == "__main__":
    main()
