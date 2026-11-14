"""
Pipeline d'assets — SAUCISSONATOR 3000

Même principe que build_assets.py (qui reste dédié à Opération Cornichon) :
les illustrations de public/assets/saucissonator/ ne sont jamais modifiées,
on en tire des copies prêtes pour le jeu dans public/assets/sprites/saucissonator/.

  - détourage du faux damier blanc incrusté dans les images
  - découpe des planches (rondelles, planche brisée)
  - réduction à la résolution logique 480x270, alpha binaire

Aucun dessin n'est généré : tout provient des fichiers sources.

Usage :  python scripts/build_saucissonator_assets.py   (pillow, numpy, scipy)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "assets" / "saucissonator"
OUT = ROOT / "public" / "assets" / "sprites" / "saucissonator"
OUT.mkdir(parents=True, exist_ok=True)

# Échelles logiques (px du jeu)
CHUCK_VICTORY_H = 179   # même hauteur que chuck_victory d'Opération Cornichon
BOARD_W = 320
KNIFE_H = 190           # manifestement beaucoup trop grand
SAUCISSON_BODY = 250    # longueur du saucisson, de la tranche au nœud
SLICE_W = 44            # largeur de la rondelle « correcte »
GIANT_W = 210           # le parpaing de porc
PLATTER_W = 190
BOXER_IDLE_H = 104
BOXER_STEAL_W = 236
BOXER_EAT_H = 150

manifest: dict[str, dict] = {}


# ---------------------------------------------------------------- helpers
def load(rel: str) -> np.ndarray:
    return np.array(Image.open(SRC / rel).convert("RGBA")).astype(np.uint8)


def border_connected(candidate: np.ndarray) -> np.ndarray:
    labels, _ = ndi.label(candidate)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(labels, edge)


def enclosed_big(candidate: np.ndarray, bg: np.ndarray, min_area: int) -> np.ndarray:
    labels, n = ndi.label(candidate & ~bg)
    if n == 0:
        return np.zeros_like(bg)
    areas = ndi.sum(np.ones_like(labels), labels, index=np.arange(1, n + 1))
    keep = np.where(areas >= min_area)[0] + 1
    return np.isin(labels, keep)


def key_checker(a: np.ndarray, holes: int = 0, erode: int = 2) -> np.ndarray:
    """Retire le faux damier blanc ; `holes` retire aussi les poches enfermées."""
    rgb = a[..., :3].astype(int)
    cand = (rgb.min(axis=2) > 236) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 10)
    bg = border_connected(cand)
    if holes:
        bg |= enclosed_big(cand, bg, holes)
    fg = ndi.binary_opening(~bg, iterations=1)
    fg = ndi.binary_erosion(fg, iterations=erode)
    out = a.copy()
    out[..., 3] = np.where(fg, 255, 0)
    return out


def clean_alpha(a: np.ndarray, thr: int = 150) -> np.ndarray:
    """Alpha natif : on coupe le halo semi-transparent."""
    out = a.copy()
    fg = ndi.binary_opening(a[..., 3] >= thr, iterations=1)
    out[..., 3] = np.where(fg, 255, 0)
    return out


def components(a: np.ndarray, join: int, min_area: int) -> list[tuple[int, int, np.ndarray]]:
    fg = a[..., 3] > 0
    grown = ndi.binary_dilation(fg, iterations=join) if join else fg
    labels, _ = ndi.label(grown)
    res = []
    for i, sl in enumerate(ndi.find_objects(labels), start=1):
        mask = (labels[sl] == i) & fg[sl]
        if mask.sum() < min_area:
            continue
        ys, xs = np.where(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sub = a[sl][y0:y1, x0:x1].copy()
        sub[..., 3] = np.where(mask[y0:y1, x0:x1], 255, 0)
        res.append((sl[0].start + y0, sl[1].start + x0, sub))
    return res


def trim(a: np.ndarray) -> np.ndarray:
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def downscale(a: np.ndarray, scale: float) -> Image.Image:
    h, w = a.shape[:2]
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    f = a.astype(np.float32) / 255.0
    f[..., :3] *= f[..., 3:4]
    chans = [Image.fromarray(f[..., c]).resize((nw, nh), Image.BOX) for c in range(4)]
    r = np.stack([np.array(c) for c in chans], axis=-1)
    alpha = r[..., 3]
    rgb = np.where(alpha[..., None] > 1e-4, r[..., :3] / np.maximum(alpha[..., None], 1e-4), 0)
    out = np.zeros((nh, nw, 4), np.uint8)
    out[..., :3] = np.clip(rgb * 255 + 0.5, 0, 255)
    out[..., 3] = np.where(alpha >= 0.5, 255, 0)
    return Image.fromarray(out)


def save(name: str, a: np.ndarray, scale: float, mirror: bool = False, **extra) -> Image.Image:
    img = downscale(trim(a), scale)
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    img.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = {"w": img.width, "h": img.height, **extra}
    print(f"  {name:22s} {img.width:4d} x {img.height:<4d} {extra or ''}")
    return img


# ---------------------------------------------------------------- Chuck
print("chuck")
vic = trim(key_checker(load("characters/chuck_charcutier_victory.png")))
s_chuck = CHUCK_VICTORY_H / vic.shape[0]
save("chuck_trophy", vic, s_chuck)
save("chuck_cutting", key_checker(load("characters/chuck_cutting.png")), s_chuck)

# ---------------------------------------------------------------- boxer
print("boxer")
b = trim(key_checker(load("characters/boxer_idle.png")))
save("boxer_idle", b, BOXER_IDLE_H / b.shape[0])
b = trim(key_checker(load("characters/boxer_stealing.png"), holes=400))
save("boxer_steal", b, BOXER_STEAL_W / b.shape[1])
b = trim(key_checker(load("characters/boxer_eating.png")))
save("boxer_eat", b, BOXER_EAT_H / b.shape[0])

# ---------------------------------------------------------------- planche
print("planche")
board = trim(clean_alpha(load("objects/cutting_board.png")))
s_board = BOARD_W / board.shape[1]
# miroir : la poignée passe à droite, les rondelles tombent à gauche
save("board", board, s_board, mirror=True)

print("planche brisée")
bd = key_checker(load("objects/board_destroyed.png"))
parts = sorted(components(bd, join=0, min_area=250), key=lambda p: -p[2][..., 3].astype(bool).sum())
halves = sorted(parts[:2], key=lambda p: p[1])
save("board_half_l", halves[0][2], s_board)
save("board_half_r", halves[1][2], s_board)
for i, (_, _, sub) in enumerate(parts[2:10]):
    save(f"splinter_{i:02d}", sub, s_board)
manifest["splinters"] = {"count": len(parts[2:10])}

# ---------------------------------------------------------------- couteau
print("couteau")
knife = trim(clean_alpha(load("objects/knife.png")))
# miroir : le tranchant passe à gauche, côté ligne de coupe
save("knife", knife, KNIFE_H / knife.shape[0], mirror=True)

# ---------------------------------------------------------------- saucisson
print("saucisson")
sau = trim(key_checker(load("objects/saucisson_whole.png"), holes=500))
fg = sau[..., 3] > 0
col_h = fg.sum(axis=0)
body_end = int(np.where(col_h > col_h.max() * 0.5)[0].max())     # fin du corps = nœud
s_sau = SAUCISSON_BODY / body_end
img = save("saucisson", sau, s_sau, body=SAUCISSON_BODY)

# face tranchée : ellipse à l'extrémité gauche, extraite pour suivre la coupe
H, W = sau.shape[:2]
rows = np.where(fg[:, : int(W * 0.12)].any(axis=1))[0]
ry = (rows.max() - rows.min()) / 2
cy = (rows.max() + rows.min()) / 2
rx = ry * 0.74
yy, xx = np.mgrid[0:H, 0:W]
inside = ((xx - rx) / rx) ** 2 + ((yy - cy) / (ry * 1.02)) ** 2 <= 1
face = sau.copy()
face[..., 3] = np.where(inside & fg, 255, 0)
face = face[:, : int(rx * 2) + 2]
fimg = downscale(face, s_sau)       # pas de trim : même repère vertical que le saucisson
fimg.save(OUT / "saucisson_face.png", optimize=True)
manifest["saucisson_face"] = {"w": fimg.width, "h": fimg.height, "rx": round(rx * s_sau, 1)}
print(f"  {'saucisson_face':22s} {fimg.width:4d} x {fimg.height:<4d} rx={rx * s_sau:.1f}")

# ---------------------------------------------------------------- rondelles
print("rondelles")
sl = key_checker(load("objects/saucisson_slices.png"))
parts = sorted(components(sl, join=0, min_area=5000), key=lambda p: p[1])
assert len(parts) == 3, len(parts)
s_slice = SLICE_W / parts[1][2].shape[1]
for nm, (_, _, sub) in zip(["thin", "ok", "thick"], parts):
    save(f"slice_{nm}", sub, s_slice)
save("slice_giant", parts[2][2], GIANT_W / parts[2][2].shape[1])

# ---------------------------------------------------------------- plateau
print("plateau")
pl = trim(key_checker(load("objects/victory_platter.png"), holes=600))
save("platter", pl, PLATTER_W / pl.shape[1])

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
print("ok —", len(manifest), "entrées")
