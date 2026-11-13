"""
Pipeline d'assets — OPÉRATION CORNICHON

Transforme les illustrations validées (public/assets/, originaux jamais modifiés) en sprites de jeu
(public/assets/sprites/) à la résolution logique 480x270 :
  - détourage des fonds « cuits » dans l'image (gris uni, faux damier blanc)
  - découpe des planches en poses individuelles
  - réduction + alpha binaire pour un rendu pixel net

Aucun dessin n'est généré : tout provient des fichiers sources.

Usage :  python scripts/build_assets.py      (nécessite pillow, numpy, scipy)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"
OUT = ASSETS / "sprites"
SOURCES = {
    "kitchen": "backgrounds/kitchen.png",
    "chuck_idle": "characters/chuck_idle.png",
    "chuck_straining": "characters/chuck_straining.png",
    "jar_closed": "objects/jar_closed.png",
    "jar_open": "objects/jar_open.png",
    "jar_explosion": "objects/jar_explosion.png",
    # malgré son nom, ce fichier contient une pose de Chuck en torsion
    "gameplay_mockup": "references/gameplay_mockup.png",
}
OUT.mkdir(parents=True, exist_ok=True)

GAME_W, GAME_H = 480, 270
CHUCK_H = 176          # hauteur logique de Chuck debout
JAR_W = 60             # largeur logique du corps du bocal

manifest: dict[str, dict] = {}


# ---------------------------------------------------------------- helpers
def load(name: str) -> np.ndarray:
    return np.array(Image.open(ASSETS / SOURCES[name]).convert("RGBA")).astype(np.uint8)


def border_connected(candidate: np.ndarray) -> np.ndarray:
    """Composantes du masque candidat qui touchent le bord de l'image."""
    labels, _ = ndi.label(candidate)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    return np.isin(labels, edge)


def enclosed_big(candidate: np.ndarray, bg: np.ndarray, min_area: int) -> np.ndarray:
    """Poches de fond enfermées (entre deux bras d'éclaboussure, etc.)."""
    labels, n = ndi.label(candidate & ~bg)
    if n == 0:
        return np.zeros_like(bg)
    areas = ndi.sum(np.ones_like(labels), labels, index=np.arange(1, n + 1))
    keep = np.where(areas >= min_area)[0] + 1
    return np.isin(labels, keep)


def key_grey(a: np.ndarray, tol: int = 26) -> np.ndarray:
    rgb = a[..., :3].astype(int)
    ref = np.median(rgb[:40, :40].reshape(-1, 3), axis=0)
    cand = np.abs(rgb - ref).max(axis=2) < tol
    bg = border_connected(cand)
    bg |= enclosed_big(cand, bg, 600)
    return finish_alpha(a, bg)


def key_checker(a: np.ndarray, holes: int = 0) -> np.ndarray:
    rgb = a[..., :3].astype(int)
    cand = (rgb.min(axis=2) > 236) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 10)
    bg = border_connected(cand)
    if holes:
        bg |= enclosed_big(cand, bg, holes)
    return finish_alpha(a, bg)


def finish_alpha(a: np.ndarray, bg: np.ndarray, erode: int = 2) -> np.ndarray:
    fg = ~bg
    fg = ndi.binary_opening(fg, iterations=1)
    fg = ndi.binary_erosion(fg, iterations=erode)   # retire le liseré clair
    out = a.copy()
    out[..., 3] = np.where(fg, 255, 0)
    return out


def clean_alpha(a: np.ndarray, thr: int = 150) -> np.ndarray:
    out = a.copy()
    fg = a[..., 3] >= thr
    fg = ndi.binary_opening(fg, iterations=1)
    out[..., 3] = np.where(fg, 255, 0)
    return out


def components(a: np.ndarray, join: int, min_area: int) -> list[tuple[slice, slice, np.ndarray]]:
    """Découpe en objets ; `join` soude les morceaux proches (gouttes de sueur…)."""
    fg = a[..., 3] > 0
    grown = ndi.binary_dilation(fg, iterations=join) if join else fg
    labels, n = ndi.label(grown)
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
    f[..., :3] *= f[..., 3:4]                                   # prémultiplié
    chans = [Image.fromarray(f[..., c]).resize((nw, nh), Image.BOX) for c in range(4)]
    r = np.stack([np.array(c) for c in chans], axis=-1)
    alpha = r[..., 3]
    rgb = np.where(alpha[..., None] > 1e-4, r[..., :3] / np.maximum(alpha[..., None], 1e-4), 0)
    out = np.zeros((nh, nw, 4), np.uint8)
    out[..., :3] = np.clip(rgb * 255 + 0.5, 0, 255)
    out[..., 3] = np.where(alpha >= 0.5, 255, 0)
    return Image.fromarray(out)


def save(name: str, a: np.ndarray, scale: float) -> None:
    img = downscale(trim(a), scale)
    img.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = {"w": img.width, "h": img.height}
    print(f"  {name:22s} {img.width:4d} x {img.height:<4d}")


# ---------------------------------------------------------------- cuisine
print("cuisine")
k = Image.open(ASSETS / SOURCES["kitchen"]).convert("RGB").resize((GAME_W, GAME_H), Image.BOX)
k.save(OUT / "kitchen.png", optimize=True)
manifest["kitchen"] = {"w": GAME_W, "h": GAME_H}
TABLE_Y = 192   # arête arrière du plan de travail (px logiques)
k.crop((0, TABLE_Y, GAME_W, GAME_H)).save(OUT / "table.png", optimize=True)
manifest["table"] = {"w": GAME_W, "h": GAME_H - TABLE_Y, "y": TABLE_Y}

# ---------------------------------------------------------------- Chuck
print("chuck — planche neutre (fond gris)")
idle = key_grey(load("chuck_idle"))
parts = sorted(components(idle, join=14, min_area=20000), key=lambda p: p[1])
assert len(parts) == 4, len(parts)
s_idle = CHUCK_H / parts[0][2].shape[0]
for nm, (_, _, sub) in zip(["front", "three_quarter", "side", "back"], parts):
    save(f"chuck_{nm}", sub, s_idle)

print("chuck — planche d'effort (alpha natif)")
st = clean_alpha(load("chuck_straining"))
parts = components(st, join=12, min_area=20000)
assert len(parts) == 6, len(parts)
parts.sort(key=lambda p: (p[0] > st.shape[0] // 2 - 80, p[1]))
s_st = CHUCK_H / parts[0][2].shape[0]
for nm, (_, _, sub) in zip(["cool", "squat", "punch", "victory", "despair", "rage"], parts):
    save(f"chuck_{nm}", sub, s_st)

print("chuck — pose de torsion (faux damier)")
tw = key_checker(load("gameplay_mockup"), holes=1500)
parts = components(tw, join=30, min_area=50000)
assert len(parts) == 1, len(parts)
save("chuck_twist", parts[0][2], CHUCK_H * 1.0 / parts[0][2].shape[0])

# ---------------------------------------------------------------- bocal
def body_width(a: np.ndarray) -> int:
    fg = a[..., 3] > 0
    ys = np.where(fg.any(axis=1))[0]
    lo = fg[int(ys.min() + (ys.max() - ys.min()) * 0.6): ys.max()]
    xs = np.where(lo.any(axis=0))[0]
    return int(xs.max() - xs.min())


print("bocal fermé")
jc = trim(clean_alpha(load("jar_closed")))
s_jar = JAR_W / body_width(jc)
save("jar_closed", jc, s_jar)

print("bocal ouvert")
jo = key_checker(load("jar_open"), holes=900)
parts = sorted(components(jo, join=0, min_area=350), key=lambda p: -p[2][..., 3].astype(bool).sum())
body = parts[0][2]
s_open = JAR_W / body_width(body)
save("jar_open_body", body, s_open)
parts = parts[:5]          # corps + couvercle, cornichon, 2 gouttes
for i, (_, _, sub) in enumerate(parts[1:]):
    save(f"open_part_{i:02d}", sub, s_open)

print("bocal explosé")
je = key_checker(load("jar_explosion"), holes=700)
parts = sorted(components(je, join=0, min_area=350), key=lambda p: -p[2][..., 3].astype(bool).sum())
parts = parts[:14]         # socle, couvercle, cornichons, éclats, gouttes
for i, (_, _, sub) in enumerate(parts):
    save(f"boom_part_{i:02d}", sub, s_open)
save("jar_explosion", je, s_open)

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
print("ok —", len(manifest), "entrées")
