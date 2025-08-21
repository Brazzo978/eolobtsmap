#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sweep su una singola immagine WMS (stesso BBOX, WIDTH, HEIGHT del tuo GetMap/GetFeatureInfo)
e simula click GetFeatureInfo su una griglia di pixel (I,J).

Uso:
  python wms_gfi_sweep.py "<WMS_BASE_URL>" "<LAYER_NAME>" out_html \
      --bbox "1252852.50301,5568056.154502,1556460.379317,5936176.882673" \
      --width 993 --height 1204 --gridx 33 --gridy 40 \
      --cookie "PHPSESSID=....; lizmap_session=...."
"""
import os, sys, time, math, hashlib, argparse, requests

HEADERS_BASE = {
    "User-Agent": "Mozilla/5.0 (DataGrab/1.0)",
    "Accept": "*/*",
    "Referer": "https://lizmap.arpa.fvg.it/test/index.php/view/map/?repository=nir&project=campi_elettromagnetici_pubblico",
}

def build_params(layer, bbox, width, height, I, J, version="1.3.0"):
    minx, miny, maxx, maxy = bbox
    base = {
        "SERVICE": "WMS",
        "REQUEST": "GetFeatureInfo",
        "VERSION": version,
        "LAYERS": layer,
        "QUERY_LAYERS": layer,
        "STYLES": "predefinito",
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
        "DPI": "96",
        "FEATURE_COUNT": "1000",
        "FI_POINT_TOLERANCE": "60",
        "FI_LINE_TOLERANCE": "20",
        "FI_POLYGON_TOLERANCE": "10",
        "EXCEPTIONS": "application/vnd.ogc.se_inimage",
        "INFO_FORMAT": "text/html",
    }
    if version == "1.3.0":
        base.update({
            "CRS": "EPSG:3857",
            "BBOX": f"{minx},{miny},{maxx},{maxy}",
            "WIDTH": str(width), "HEIGHT": str(height),
            "I": str(I), "J": str(J),
            "X": str(I), "Y": str(J),  # compat
        })
    else:  # 1.1.1
        base.update({
            "SRS": "EPSG:3857",
            "BBOX": f"{minx},{miny},{maxx},{maxy}",
            "WIDTH": str(width), "HEIGHT": str(height),
            "X": str(I), "Y": str(J),
        })
    return base

def parse_bbox(s):
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 4: raise ValueError("BBOX deve essere minx,miny,maxx,maxy")
    return tuple(float(p) for p in parts)

def main():
    ap = argparse.ArgumentParser(description="Lizmap WMS GetFeatureInfo pixel-sweep.")
    ap.add_argument("wms_base")
    ap.add_argument("layer")
    ap.add_argument("out_dir")
    ap.add_argument("--bbox", required=True, help="minx,miny,maxx,maxy EPSG:3857")
    ap.add_argument("--width", type=int, required=True)
    ap.add_argument("--height", type=int, required=True)
    ap.add_argument("--gridx", type=int, default=25, help="campioni lungo X (pixel)")
    ap.add_argument("--gridy", type=int, default=30, help="campioni lungo Y (pixel)")
    ap.add_argument("--cookie", default=None, help='Cookie header: "PHPSESSID=...; lizmap_session=..."')
    ap.add_argument("--sleep", type=float, default=0.02)
    args = ap.parse_args()

    bbox = parse_bbox(args.bbox)
    os.makedirs(args.out_dir, exist_ok=True)

    headers = dict(HEADERS_BASE)
    if args.cookie:
        headers["Cookie"] = args.cookie

    sess = requests.Session()
    sess.headers.update(headers)

    xs = [int(round((k + 0.5) * args.width / args.gridx)) for k in range(args.gridx)]
    ys = [int(round((k + 0.5) * args.height / args.gridy)) for k in range(args.gridy)]

    hits = 0
    seen = set()

    total = len(xs) * len(ys)
    done = 0
    for J in ys:
        for I in xs:
            done += 1
            got = False
            # 1) 1.3.0
            p = build_params(args.layer, bbox, args.width, args.height, I, J, version="1.3.0")
            try:
                r = sess.get(args.wms_base, params=p, timeout=40)
                if r.status_code == 200 and r.text.strip() and ("lizmapPopup" in r.text or "<table" in r.text):
                    h = hashlib.md5(r.text.encode("utf-8")).hexdigest()
                    if h not in seen:
                        seen.add(h); hits += 1; got = True
                        with open(os.path.join(args.out_dir, f"gfi_{J}_{I}_v13_{h}.html"), "w", encoding="utf-8") as f:
                            f.write(r.text)
                        print(f"[hit] {done}/{total}  I={I} J={J} v1.3.0")
            except Exception:
                pass

            # 2) 1.1.1 fallback
            if not got:
                p = build_params(args.layer, bbox, args.width, args.height, I, J, version="1.1.1")
                try:
                    r = sess.get(args.wms_base, params=p, timeout=40)
                    if r.status_code == 200 and r.text.strip() and ("lizmapPopup" in r.text or "<table" in r.text):
                        h = hashlib.md5(r.text.encode("utf-8")).hexdigest()
                        if h not in seen:
                            seen.add(h); hits += 1
                            with open(os.path.join(args.out_dir, f"gfi_{J}_{I}_v111_{h}.html"), "w", encoding="utf-8") as f:
                                f.write(r.text)
                            print(f"[hit] {done}/{total}  I={I} J={J} v1.1.1")
                except Exception:
                    pass

            if done % 50 == 0:
                print(f"[{done}/{total}] hits finora: {hits}")
            time.sleep(args.sleep)

    print(f"[DONE] popup salvati: {hits}  (cartella: {args.out_dir})")

if __name__ == "__main__":
    main()
