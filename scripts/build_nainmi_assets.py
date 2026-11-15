"""
Pipeline d'assets — Les Nain-Mi, poses au repos

Source : public/assets/sources/nainmi_sheet.png (planche de présentation 1536 x 1024, jamais modifiée).
On n'en tire que les 8 personnages de la grande rangée du haut, détourés et normalisés :

  public/assets/nainmi/<couleur>/idle.png   RGBA 160 x 160
  public/assets/nainmi/manifest.json        cadre, ligne des pieds, mesures et contrôles qualité

Rien n'est redessiné : chaque pixel opaque vient de la planche. Seuls changent l'alpha (détourage),
la couleur des pixels de bord (on retire la part de fond bleu nuit qu'ils contiennent, sinon halo
sombre) et l'échelle (réduction Lanczos en alpha prémultiplié).

Détourage, personnage par personnage :
  1. Fenêtre autour de l'étiquette de couleur ; on coupe à la ligne d'ombre de contact sous les
     semelles (l'étiquette commence 2 à 3 px plus bas).
  2. Pixels du personnage = teinte proche de la sienne, saturés et assez lumineux, plus les reflets
     blancs qui les touchent. Bleu et cyan, de la même famille que le fond : ombres reconnues à leur
     teinte. On garde le corps (plus grande composante) et ce qui y est relié : texte, logo, sol et
     voisins tombent ; dans la zone des semelles, le reflet du sol est coupé.
  3. Plis sombres étroits entre deux parties du corps : gardés (traits du dessin).
  4. Trous enfermés : rebouchés dans la tête (pupilles sombres) ; ailleurs, laissés transparents
     s'ils montrent le fond (entre les jambes).
  5. Lissage du masque (pointes et encoches de 1 px), puis bord : alpha fractionnaire et couleur
     sans fond, d'après le fond local et l'intérieur voisin.

Méthode, mesures et défauts connus : docs/nainmi-extraction.md

Usage :  python scripts/build_nainmi_assets.py [--debug DOSSIER]   (pillow, numpy)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "public" / "assets" / "sources" / "nainmi_sheet.png"
OUT = ROOT / "public" / "assets" / "nainmi"

FRAME = 160      # cadre carré transparent
HEIGHT = 148     # hauteur apparente commune, du haut du crâne au bas des semelles
BASELINE = 154   # ligne des pieds : bord bas des semelles (6 px de marge en bas comme en haut)

# Rangée du haut de la planche, de gauche à droite : (id, nom, teinte, tolérance, étiquette x0, x1)
NAINMI = [
    ("red",    "rouge",  357, 16, 158, 290),
    ("blue",   "bleu",   212, 24, 328, 455),
    ("yellow", "jaune",   45, 26, 495, 620),
    ("green",  "vert",   104, 28, 660, 787),
    ("purple", "violet", 275, 26, 825, 953),
    ("orange", "orange",  20, 22, 995, 1130),
    ("cyan",   "cyan",   189, 20, 1173, 1305),
    ("pink",   "rose",   337, 26, 1352, 1484),
]
# Le logo « Le Grand Débarras » touche presque le crâne du rouge ; son contour brun-rouge a la
# teinte du personnage. Zone retirée à la main (polygone, coordonnées de la planche), qui longe le
# haut du crâne à 1 px près.
EXCLUDE = {"red": [(124, 96), (191, 96), (191, 119), (180, 130), (124, 130)]}
# Bleu et cyan ont la même famille de teinte que le fond et son halo (~205-210°). Parties claires :
# séparées par la luminosité. Parties sombres : par la teinte, mesurée sur la planche (ombres du bleu
# vers 223-240°, plus violettes ; ombres du cyan vers 193-204°, plus vertes).
CLOSE_TO_BACKGROUND = {"blue": (216, 245), "cyan": (183, 203)}

ROW_TOP = 96          # sous le sous-titre « Design simplifié… »
SOLE_SEARCH = (294, 309)  # lignes où chercher l'ombre de contact entre semelles et étiquette
WINDOW_MARGIN = 34    # marge horizontale de la fenêtre autour de l'étiquette
HEAD_SHARE = 0.40     # part haute du personnage où tout trou est rebouché (yeux, pupilles)
CREASE = 2            # plis sombres de moins de 2 x CREASE px de large : gardés (traits du dessin)
CREASE_CLOSE = 3      # bleu et cyan : leurs plis ont la couleur du fond, seule la forme les distingue
SMOOTH = 0.8          # flou (px) du masque avant re-seuillage à 50 %
FOREIGN_MARGIN = 2    # px retirés autour d'un décor d'une autre couleur (contour du logo)
FLOOR_ROWS = 16       # au-dessus de la ligne de contact : zone des semelles, où traîne le reflet du sol


# ---------------------------------------------------------------- outils numpy (sans scipy)

def hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mx, mn = rgb.max(-1), rgb.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    return h, s, mx


def hue_dist(h: np.ndarray, ref: float) -> np.ndarray:
    d = np.abs(h - ref) % 360
    return np.minimum(d, 360 - d)


def dilate(m: np.ndarray, r: int = 1) -> np.ndarray:
    for _ in range(r):
        p = np.pad(m, 1)
        m = (p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
             | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:])
    return m


def erode(m: np.ndarray, r: int = 1) -> np.ndarray:
    for _ in range(r):
        p = np.pad(m, 1, constant_values=True)
        m = (p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
             & p[:-2, :-2] & p[:-2, 2:] & p[2:, :-2] & p[2:, 2:])
    return m


def label(mask: np.ndarray, eight: bool = False) -> tuple[np.ndarray, int]:
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if eight:
        steps += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    m = mask.tolist()
    lb = lab.tolist()
    n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not m[y0][x0] or lb[y0][x0]:
                continue
            n += 1
            lb[y0][x0] = n
            stack = [(y0, x0)]
            while stack:
                y, x = stack.pop()
                for dy, dx in steps:
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy][xx] and not lb[yy][xx]:
                        lb[yy][xx] = n
                        stack.append((yy, xx))
    return np.array(lb, np.int32), n


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = img.astype(np.float64)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode="edge")
        acc = np.zeros_like(out)
        n = out.shape[axis]
        for i, kv in enumerate(k):
            acc += kv * np.take(p, np.arange(i, i + n), axis=axis)
        out = acc
    return out


def border_connected(bg: np.ndarray) -> np.ndarray:
    lab, _ = label(bg)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return np.isin(lab, edge[edge > 0])


def keep_thin_creases(fg: np.ndarray, r: int, allowed: np.ndarray) -> np.ndarray:
    """Fermeture morphologique, sauf près du fond extérieur : on garde les plis sombres entre deux
    parties du personnage (bras contre torse, menton) sans combler les creux de la silhouette.
    `allowed` : pixels que la fermeture a le droit d'ajouter (pas le fond vu par une fente)."""
    added = erode(dilate(fg, r), r) & ~fg & allowed
    outside = border_connected(~(fg | added))
    for _ in range(r + 1):
        peel = added & dilate(outside, 1)
        if not peel.any():
            break
        added &= ~peel
        outside |= peel
    return fg | added


def limit_floor(fg: np.ndarray, start: int, step: int) -> np.ndarray:
    """Dans la zone des semelles, une ligne ne déborde pas de plus de `step` px la ligne du dessus :
    les semelles s'évasent doucement, le reflet du sol part d'un coup sur le côté."""
    out = fg.copy()
    for y in range(max(1, start), fg.shape[0]):
        prev = out[y - 1]
        allowed = prev.copy()
        for s in range(1, step + 1):
            allowed[s:] |= prev[:-s]
            allowed[:-s] |= prev[s:]
        out[y] &= allowed
    return out


def largest(mask: np.ndarray) -> np.ndarray:
    lab, n = label(mask)
    if n == 0:
        return mask
    sizes = np.bincount(lab.ravel())[1:]
    return lab == (1 + int(np.argmax(sizes)))


def masked_mean(rgb: np.ndarray, mask: np.ndarray, sigmas=(1.5, 3, 6, 12)) -> np.ndarray:
    """Couleur moyenne locale des pixels de `mask` (élargit le rayon là où il n'y en a pas)."""
    res = np.zeros_like(rgb)
    done = np.zeros(mask.shape, bool)
    w0 = mask.astype(np.float64)
    for s in sigmas:
        w = blur(w0, s)
        c = blur(rgb * w0[..., None], s)
        ok = (w > 0.02) & ~done
        res[ok] = c[ok] / w[ok, None]
        done |= ok
    return res


# ---------------------------------------------------------------- détourage d'un personnage

def cut_out(sheet: np.ndarray, spec: tuple) -> dict:
    cid, name, hue, tol, lx0, lx1 = spec
    x0, x1 = max(0, lx0 - WINDOW_MARGIN), min(sheet.shape[1], lx1 + WINDOW_MARGIN)

    # Ligne d'ombre de contact entre semelles et étiquette : colonne par colonne, la ligne la plus
    # sombre ; hors des semelles, la valeur médiane.
    sy0, sy1 = SOLE_SEARCH
    v_rows = sheet[sy0:sy1, x0:x1].max(-1)
    per_col = sy0 + np.argmin(v_rows, axis=0)
    under = np.zeros(x1 - x0, bool)
    under[lx0 - x0: lx1 - x0] = True
    cut_mid = int(np.median(per_col[under]))
    cut_col = np.where(np.abs(per_col - cut_mid) <= 2, per_col, cut_mid)
    # La fenêtre descend 3 lignes sous la coupe : ces lignes (ombre de contact) ne sont jamais
    # gardées, mais servent de fond local pour le bord bas des semelles.
    win_bottom = int(cut_col.max()) + 3

    rgb = sheet[ROW_TOP:win_bottom, x0:x1]
    rows = np.arange(ROW_TOP, win_bottom)[:, None]
    above_cut = rows < cut_col[None, :]
    h, s, v = hsv(rgb)
    close = cid in CLOSE_TO_BACKGROUND
    s_min, v_min = (0.88, 0.5) if close else (0.5, 0.14)
    core = (s >= s_min) & (v >= v_min) & (hue_dist(h, hue) <= tol)
    if close:
        core |= (v >= 0.78) & (s >= 0.35) & (hue_dist(h, hue) <= tol)   # reflets un peu pâles
        # Ombres du personnage, sauf au ras du sol où l'ombre portée a exactement la même couleur.
        lo, hi = CLOSE_TO_BACKGROUND[cid]
        above_floor = rows < cut_mid - FLOOR_ROWS
        core |= (s >= s_min) & (v >= 0.2) & (h >= lo) & (h <= hi) & above_floor
    glint = (v >= 0.75) & (s < s_min)   # reflets blancs
    if not close:
        # Un reflet bleuté peut aussi être la lueur du sol vue par une fente (entre les jambes du
        # rose) : pas de point d'appui pour le corps ; enfermé dans le personnage, il est rebouché.
        glint &= ~((hue_dist(h, 208) < 30) & (s > 0.2))
    # Décor d'une autre couleur (logo, voisins), élargi pour emporter son contour sombre.
    # La famille bleue du fond n'en fait pas partie : les reflets de contre-jour sont bleutés.
    foreign = (s > 0.4) & (v > 0.4) & (hue_dist(h, hue) > 60) & (hue_dist(h, 210) > 25)
    foreign = dilate(foreign, FOREIGN_MARGIN)
    if cid in EXCLUDE:
        poly = Image.new("1", (x1 - x0, win_bottom - ROW_TOP), 0)
        ImageDraw.Draw(poly).polygon([(x - x0, y - ROW_TOP) for x, y in EXCLUDE[cid]], fill=1)
        foreign |= np.array(poly, bool)
    core &= above_cut & ~foreign
    glint &= above_cut & ~foreign

    body = largest(core)
    if not body.any():
        raise SystemExit(f"{cid} : aucun pixel trouvé")
    cand = core | glint
    lab2, _ = label(cand, eight=True)
    keep = np.unique(lab2[body])
    fg = np.isin(lab2, keep[keep > 0])
    fg = largest(limit_floor(fg, cut_mid - ROW_TOP - FLOOR_ROWS, 1 if close else 2))
    # Fond bleu nuit et son halo. Pour les teintes éloignées du fond, un pli du personnage a sa
    # couleur (déjà retenu) : une fente bleu nuit est donc du vrai fond (entre les jambes de l'orange).
    navy_like = (hue_dist(h, 208) < 25) & (s > 0.3) & (v < 0.65)
    allowed = np.ones_like(fg) if close else ~navy_like
    fg = keep_thin_creases(fg, CREASE_CLOSE if close else CREASE, allowed) & above_cut

    # Trous enfermés.
    ys = np.nonzero(fg.any(1))[0]
    top, bottom = int(ys.min()), int(ys.max())
    head_limit = top + HEAD_SHARE * (bottom - top)
    bgl, nb = label(~fg)
    border = set(np.unique(np.concatenate([bgl[0], bgl[-1], bgl[:, 0], bgl[:, -1]])).tolist())
    # Un trou montre le fond s'il est bleu nuit (ou, pour les teintes éloignées, bleuté : lueur du sol).
    if close:
        hole_bg = (v < 0.42) & (hue_dist(h, 208) < 22) & (s > 0.45)
    else:
        hole_bg = (hue_dist(h, 208) < 30) & (s > 0.2)
    holes_kept, holes_filled = [], []
    for i in range(1, nb + 1):
        if i in border:
            continue
        m = bgl == i
        yy, xx = np.nonzero(m)
        info = {"x": int(xx.mean()) + x0, "y": int(yy.mean()) + ROW_TOP, "area": int(m.sum())}
        if yy.mean() > head_limit and m.sum() >= 4 and hole_bg[m].mean() > 0.6:
            holes_kept.append(info)
        else:
            fg |= m
            holes_filled.append(info)

    # Lissage : retire les pointes de 1-2 px (ombre portée au ras des semelles, bruit du seuil) et
    # comble les encoches de 1 px. Le bord fin est refait juste après par l'alpha fractionnaire.
    fg = largest(dilate(erode(fg, 1), 1))
    fg = largest(blur(fg.astype(np.float64), SMOOTH) >= 0.5) & above_cut

    # Bord : alpha fractionnaire par projection entre fond local B et intérieur local F.
    inner = erode(fg, 1)
    outside = ~dilate(fg, 1)
    band = ~inner & ~outside
    B = masked_mean(rgb, outside)
    F = masked_mean(rgb, inner)
    d = F - B
    dd = (d * d).sum(-1)
    t = ((rgb - B) * d).sum(-1) / np.maximum(dd, 1e-6)
    alpha = fg.astype(np.float64)
    ok = band & (dd > 0.01)
    alpha[ok] = np.clip(t[ok], 0, 1)
    alpha[alpha < 0.04] = 0

    # Couleur des pixels de bord sans la part de fond : C = a.F' + (1-a).B  =>  F' = (C - (1-a).B) / a
    col = rgb.copy()
    edge = band & (alpha > 0)
    a3 = np.maximum(alpha, 1e-3)[..., None]
    pure = np.clip((rgb - (1 - a3) * B) / a3, 0, 1)
    w = np.clip(alpha / 0.5, 0, 1)[..., None]           # bords très transparents : couleur voisine
    col[edge] = (w * pure + (1 - w) * F)[edge]

    rgba = np.zeros(rgb.shape[:2] + (4,))
    rgba[..., :3] = col
    rgba[..., 3] = alpha

    solid = alpha >= 0.5
    ys, xs = np.nonzero(solid)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    touches = {
        "left": bool(solid[:, 0].any()), "right": bool(solid[:, -1].any()),
        "top": bool(solid[0].any()),
    }
    return {
        "id": cid, "name": name, "rgba": rgba, "rgb": rgb, "fg": fg, "band": band,
        "origin": (x0, ROW_TOP), "cut": cut_mid, "box": box, "touches": touches,
        "holes_kept": holes_kept, "holes_filled": holes_filled,
    }


# ---------------------------------------------------------------- normalisation 160 x 160

def normalize(c: dict) -> tuple[np.ndarray, dict]:
    rgba = c["rgba"]
    bx0, by0, bx1, by1 = c["box"]
    scale = HEIGHT / (by1 - by0)
    pad = 64
    src = np.zeros((rgba.shape[0] + 2 * pad, rgba.shape[1] + 2 * pad, 4))
    src[pad:-pad, pad:-pad] = rgba
    prem = src.copy()
    prem[..., :3] *= prem[..., 3:4]

    cx = (bx0 + bx1) / 2 + pad
    sy0 = by0 + pad - (BASELINE - HEIGHT) / scale
    sx0 = cx - (FRAME / 2) / scale
    box = (sx0, sy0, sx0 + FRAME / scale, sy0 + FRAME / scale)
    chans = [
        np.array(Image.fromarray(prem[..., k].astype(np.float32), "F").resize((FRAME, FRAME), Image.LANCZOS, box=box))
        for k in range(4)
    ]
    out = np.clip(np.stack(chans, -1), 0, 1)
    a = out[..., 3]
    a[a < 1 / 255] = 0
    rgb = np.where(a[..., None] > 0, out[..., :3] / np.maximum(a[..., None], 1e-6), 0)
    img = np.zeros((FRAME, FRAME, 4), np.uint8)
    img[..., :3] = np.clip(np.round(np.clip(rgb, 0, 1) * 255), 0, 255)
    img[..., 3] = np.clip(np.round(a * 255), 0, 255)

    solid = img[..., 3] >= 128
    ys, xs = np.nonzero(solid)
    meta = {
        "scale": round(scale, 4),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "centerX": round((xs.min() + xs.max() + 1) / 2, 2),
        "massCenterX": round(float((img[..., 3] * np.arange(FRAME)).sum() / img[..., 3].sum()), 2),
    }
    return img, meta


# ---------------------------------------------------------------- contrôles qualité

def fringe_score(img: np.ndarray) -> float:
    """Écart de luminosité entre le liseré (alpha partiel) et l'intérieur voisin : < 0 = liseré plus sombre."""
    a = img[..., 3].astype(float) / 255
    lum = (img[..., :3].astype(float) @ [0.2126, 0.7152, 0.0722]) / 255
    edge = (a > 0.1) & (a < 0.9)
    solid = a >= 0.99
    near = blur(solid.astype(float) * lum, 2.0) / np.maximum(blur(solid.astype(float), 2.0), 1e-6)
    return round(float((lum[edge] - near[edge]).mean()), 4)


def debug_panel(c: dict, img: np.ndarray, path: Path) -> None:
    rgb = (c["rgb"] * 255).astype(np.uint8)
    h, w = rgb.shape[:2]
    over = rgb.copy()
    over[~c["fg"]] = (over[~c["fg"]] * 0.25 + np.array([255, 0, 255]) * 0.75).astype(np.uint8)
    over[c["band"]] = [255, 255, 255]
    cut = (np.clip(c["rgba"], 0, 1) * 255).astype(np.uint8)

    def on(bg, a_img):
        a = a_img[..., 3:4].astype(float) / 255
        return (a_img[..., :3] * a + bg * (1 - a)).astype(np.uint8)

    def checker(hh, ww, n=8):
        yy, xx = np.mgrid[0:hh, 0:ww]
        return np.where(((yy // n + xx // n) % 2)[..., None] == 0, 205, 245).astype(np.uint8).repeat(3, -1)

    tiles = [rgb, over, on(checker(h, w), cut), on(np.full((h, w, 3), [214, 219, 226], np.uint8), cut)]
    k = 160 / h
    fr = [on(checker(FRAME, FRAME), img), on(np.full((FRAME, FRAME, 3), [214, 219, 226], np.uint8), img),
          on(np.full((FRAME, FRAME, 3), 255, np.uint8), img), on(np.zeros((FRAME, FRAME, 3), np.uint8), img)]
    row1 = np.concatenate(tiles, 1)
    row2 = np.concatenate(fr, 1)
    W = max(row1.shape[1], row2.shape[1])
    canvas = np.full((row1.shape[0] + row2.shape[0] + 8, W, 3), 40, np.uint8)
    canvas[: row1.shape[0], : row1.shape[1]] = row1
    canvas[row1.shape[0] + 8:, : row2.shape[1]] = row2
    Image.fromarray(canvas).resize((canvas.shape[1] * 2, canvas.shape[0] * 2), Image.NEAREST).save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", type=Path, help="dossier où écrire des planches de diagnostic")
    args = ap.parse_args()

    sheet = np.array(Image.open(SHEET).convert("RGB")).astype(np.float64) / 255
    if sheet.shape[:2] != (1024, 1536):
        raise SystemExit(f"planche inattendue : {sheet.shape[1]} x {sheet.shape[0]}")
    manifest = {
        "source": str(SHEET.relative_to(ROOT)),
        "frame": FRAME, "height": HEIGHT, "baseline": BASELINE,
        "pose": "idle", "characters": {},
    }
    if args.debug:
        args.debug.mkdir(parents=True, exist_ok=True)
    for spec in NAINMI:
        c = cut_out(sheet, spec)
        img, meta = normalize(c)
        dest = OUT / c["id"]
        dest.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img, "RGBA").save(dest / "idle.png", optimize=True)
        ox, oy = c["origin"]
        bx0, by0, bx1, by1 = c["box"]
        entry = {
            "name": c["name"],
            "file": f"{c['id']}/idle.png",
            "sourceBox": [bx0 + ox, by0 + oy, bx1 + ox, by1 + oy],
            "contactLine": c["cut"],
            **meta,
            "holesKept": c["holes_kept"],
            "holesFilled": len(c["holes_filled"]),
            "fringe": fringe_score(img),
            "touchesWindow": [k for k, v in c["touches"].items() if v],
        }
        manifest["characters"][c["id"]] = entry
        print(f"{c['id']:7s} source {bx1 - bx0}x{by1 - by0} @({bx0 + ox},{by0 + oy})  échelle {meta['scale']:.3f}"
              f"  cadre {meta['bbox']}  trous gardés {len(c['holes_kept'])} rebouchés {len(c['holes_filled'])}"
              f"  liseré {entry['fringe']:+.3f}  coupe y={c['cut']}  bords {entry['touchesWindow']}")
        if args.debug:
            debug_panel(c, img, args.debug / f"{c['id']}.png")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
