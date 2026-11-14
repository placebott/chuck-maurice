"""
Outils communs de fabrication des sprites (détourage, découpe, réduction).

Repris de build_assets.py / build_saucissonator_assets.py, qui gardent leurs propres copies
pour rester autonomes. Les originaux ne sont jamais modifiés : on ne fait que lire.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def load(path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA")).astype(np.uint8)


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


def key_checker(a: np.ndarray, holes: int = 0, erode: int = 2, floor: int = 236, spread: int = 10) -> np.ndarray:
    """Retire un faux damier clair incrusté ; `holes` retire aussi les poches enfermées."""
    rgb = a[..., :3].astype(int)
    cand = (rgb.min(axis=2) > floor) & ((rgb.max(axis=2) - rgb.min(axis=2)) < spread)
    bg = border_connected(cand)
    if holes:
        bg |= enclosed_big(cand, bg, holes)
    fg = ndi.binary_opening(~bg, iterations=1)
    fg = ndi.binary_erosion(fg, iterations=erode)
    out = a.copy()
    out[..., 3] = np.where(fg, 255, 0)
    return out


def clean_alpha(a: np.ndarray, thr: int = 150) -> np.ndarray:
    """Alpha natif : on coupe les bords semi-transparents."""
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
    """Réduction par moyenne (alpha prémultiplié) puis alpha binaire : pixels nets."""
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
