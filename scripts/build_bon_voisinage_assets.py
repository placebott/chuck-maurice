"""
Pipeline d'assets — MAURIIIIICE !!! / OPÉRATION BON VOISINAGE (mission 004)

Les 18 illustrations de public/assets/bon-voisinage/ ne sont jamais modifiées :
on en tire des dérivés prêts pour le jeu dans public/assets/sprites/bon-voisinage/.

Trois échelles, pour que chaque plan s'affiche à 1 texel = 1 pixel de la scène 480x270 :
  - « large »  : le plan de jeu (les deux jardins) ;
  - « moyen »  : les plans de cinématique où l'on voit Jean-Mi en pied devant la clôture ;
  - « gros »   : les gros plans (visage, short déchiré, Chuck).

Le sprite jeanmi_short_torn.png contient Jean-Mi ET un panneau de clôture vu de face. On en tire :
  - torn_*   : le panneau complet, sans le bas de la jambe pendante (le grillage est reconstitué derrière) ;
  - leg_*    : le bas de cette jambe, pour la faire mouliner autour du genou ;
  - fence_*  : le même panneau sans Jean-Mi, pour prolonger la clôture de part et d'autre.
jeanmi_back.png est découpé en tronc + deux jambes pour l'escalade.

Usage :  python scripts/build_bon_voisinage_assets.py   (pillow, numpy, scipy)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from sprite_tools import clean_alpha, components, key_checker, load, trim

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "assets" / "bon-voisinage"
OUT = ROOT / "public" / "assets" / "sprites" / "bon-voisinage"
META = ROOT / "src" / "voisinage" / "config" / "sprites.ts"
OUT.mkdir(parents=True, exist_ok=True)

GAME_W, GAME_H = 480, 270
ALPHA = 200   # les originaux ont un halo semi-transparent : on ne garde que le cœur opaque

# --- plan large
CHUCK_H = 108
JEANMI_H = 100            # debout ; les poses ramassées sont un peu plus basses
FUEGO_W = 140
BBQ_H = 64
STEREO_H = 74
BOXER_H = 50
# --- plans de cinématique
CHUCK_CU = 0.40           # Chuck en plan américain
JEANMI_CU_H = 250         # gros plan sur Jean-Mi
TORN_MID, TORN_BIG = 0.12, 0.18
JEANMI_MID_H = 178        # Jean-Mi en pied devant la clôture « moyenne »

manifest: dict[str, dict] = {}


def downscale(a: np.ndarray, scale: float, thr: float = 0.5) -> Image.Image:
    """Réduction par moyenne (alpha prémultiplié) puis alpha binaire. `thr` bas garde les traits fins."""
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
    out[..., 3] = np.where(alpha >= thr, 255, 0)
    return Image.fromarray(out)


def save(name: str, a: np.ndarray, scale: float, thr: float = 0.5, **extra) -> Image.Image:
    img = downscale(trim(a), scale, thr)
    img.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = {"w": img.width, "h": img.height, **extra}
    print(f"  {name:22s} {img.width:4d} x {img.height}")
    return img


def cut(path: str) -> np.ndarray:
    return clean_alpha(load(SRC / path), thr=ALPHA)


def height_of(a: np.ndarray) -> int:
    return trim(a).shape[0]


def width_of(a: np.ndarray) -> int:
    return trim(a).shape[1]


# ---------------------------------------------------------------- décors
print("décors")
bg = Image.open(SRC / "backgrounds/neighbor_duel.png").convert("RGB")


def backdrop(name: str, box: tuple[int, int, int, int]) -> None:
    img = bg.crop(box).resize((GAME_W, GAME_H), Image.BOX)
    img.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = {"w": GAME_W, "h": GAME_H}
    print(f"  {name:22s} {GAME_W:4d} x {GAME_H}   <- {box}")


backdrop("duel", (0, 0, bg.width, bg.height))
# côté Chuck et côté Jean-Mi, cadrés pour ne pas montrer la clôture en perspective du décor
backdrop("cine_chuck", (0, 340, 764, 770))
backdrop("cine_chuck_big", (130, 480, 663, 780))
backdrop("cine_jeanmi", (965, 360, 1672, 758))
# Jean-Mi a gagné le droit de boire son pastis au calme : illustration pleine page de la fin « sieste ».
# Un peu plus large que la scène, pour un lent travelling sans agrandir les pixels.
PASTIS_W, PASTIS_H = 576, 324
img = Image.open(SRC / "backgrounds/jeanmi_pastis_victory.webp").convert("RGB").resize((PASTIS_W, PASTIS_H), Image.BOX)
img.save(OUT / "cine_pastis.png", optimize=True)
manifest["cine_pastis"] = {"w": PASTIS_W, "h": PASTIS_H}
print(f"  {'cine_pastis':22s} {PASTIS_W:4d} x {PASTIS_H}")

# ---------------------------------------------------------------- personnages
print("personnages")
chuck_a = cut("characters/chuck_unbothered.png")
chuck_b = cut("characters/chuck_sunglasses.png")
s_chuck = CHUCK_H / height_of(chuck_a)
save("chuck_unbothered", chuck_a, s_chuck)
save("chuck_sunglasses", chuck_b, s_chuck)
save("chuck_unbothered_cu", chuck_a, CHUCK_CU)
save("chuck_sunglasses_cu", chuck_b, CHUCK_CU)

back = cut("characters/jeanmi_back.png")
turn = cut("characters/jeanmi_turn.png")
watch = cut("characters/jeanmi_watch.png")
rage = cut("characters/jeanmi_rage.png")
melt = cut("characters/jeanmi_meltdown.png")
save("jm_back", back, JEANMI_H / height_of(back))
save("jm_turn", turn, JEANMI_H / height_of(turn))
save("jm_watch", watch, JEANMI_H / height_of(watch))
save("jm_rage", rage, JEANMI_H * 0.9 / height_of(rage))
save("jm_meltdown", melt, JEANMI_H * 0.93 / height_of(melt))
save("jm_meltdown_cu", melt, JEANMI_CU_H / height_of(melt))
save("jm_watch_cu", watch, JEANMI_CU_H / height_of(watch))
save("jm_rage_mid", rage, JEANMI_MID_H * 0.9 / height_of(rage))
# Jean-Mi assis, pastis levé (fin « sieste ») : faux damier clair à retirer ; la chaise blanche reste pleine
seated = key_checker(load(SRC / "characters/jeanmi_pastis_victory.webp"), floor=236, spread=10)
save("jm_pastis", seated, 82 / height_of(seated))

# Jean-Mi de dos, découpé : tronc (avec les mains) + deux jambes articulées à la hanche
print("jean-mi de dos, articulé")
HIP_Y, OVERLAP = 1250, 35
fg = back[..., 3] > 0
low = np.zeros_like(fg)
low[HIP_Y - OVERLAP:] = fg[HIP_Y - OVERLAP:]
labels, n = ndi.label(low)
bottom = fg.shape[0] - 1 - np.argmax(fg[::-1].any(axis=1))
legs = []
for i in range(1, n + 1):
    m = labels == i
    ys, xs = np.where(m)
    if ys.max() > bottom - 120 and m.sum() > 20000:   # descend jusqu'aux sandales
        legs.append((xs.mean(), m))
legs.sort(key=lambda t: t[0])
assert len(legs) == 2, len(legs)
leg_mask = legs[0][1] | legs[1][1]
body = back.copy()
body[..., 3] = np.where(fg & ~(leg_mask & (np.arange(fg.shape[0])[:, None] >= HIP_Y)), 255, 0)
ys, xs = np.where(fg)
ox, oy = xs.min(), ys.min()
s_mid = JEANMI_MID_H / height_of(back)


def piece(name: str, mask: np.ndarray, pivot: tuple[float, float]) -> None:
    """Enregistre un morceau, avec sa position et son pivot dans le repère du sprite entier."""
    a = back.copy()
    a[..., 3] = np.where(mask, 255, 0)
    ys, xs = np.where(mask)
    img = save(name, a, s_mid)
    manifest[name].update(
        x=round((xs.min() - ox) * s_mid), y=round((ys.min() - oy) * s_mid),
        px=round((pivot[0] - xs.min()) * s_mid) / img.width, py=round((pivot[1] - ys.min()) * s_mid) / img.height,
    )


piece("jm_back_body", body[..., 3] > 0, (ox, oy))
for side, (cx, m) in zip(("l", "r"), legs):
    piece(f"jm_back_leg_{side}", m, (cx, HIP_Y - 10))
manifest["jm_back_mid"] = {"w": round((xs.max() - ox + 1) * s_mid), "h": round((ys.max() - oy + 1) * s_mid)}

# ---------------------------------------------------------------- le short de la discorde
print("short déchiré : panneau, jambe, clôture seule")
torn = cut("characters/jeanmi_short_torn.png")
fg = torn[..., 3] > 0
H, W = fg.shape
PERIOD = 102                       # pas horizontal du grillage (mesuré par autocorrélation)
RAIL = (1085, 1150)                # lisse haute
POST_L, POST_R = 128, 1295         # poteaux : colonnes < POST_L et > POST_R
RAIL_SAMPLE = 1240                 # colonne où la lisse est dégagée
# bas de la jambe pendante : du genou à la sandale
LEG_POLY = [(735, 1295), (960, 1225), (975, 1320), (900, 1730), (600, 1730), (600, 1450), (700, 1350)]
KNEE = (850, 1265)

solid = ndi.binary_opening(fg, structure=np.ones((3, 3)), iterations=8)   # efface les fils du grillage
poly = Image.new("L", (W, H), 0)
ImageDraw.Draw(poly).polygon(LEG_POLY, fill=255)
leg = solid & (np.array(poly) > 0)
lab, n = ndi.label(leg)
leg = lab == (1 + np.argmax(ndi.sum(leg, lab, index=np.arange(1, n + 1))))
leg = ndi.binary_fill_holes(ndi.binary_dilation(leg, iterations=4) & fg & (np.array(poly) > 0))


def mesh_fill(a: np.ndarray, hole: np.ndarray, blocked: np.ndarray) -> np.ndarray:
    """Remplit `hole` avec le grillage voisin, décalé d'un nombre entier de mailles."""
    out = a.copy()
    todo = hole.copy()
    for k in (1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6):
        if not todo.any():
            break
        src_ok = np.roll(~blocked, k * PERIOD, axis=1)
        src_ok[:, : max(0, k * PERIOD)] = False
        if k < 0:
            src_ok[:, k * PERIOD:] = False
        take = todo & src_ok
        out[take] = np.roll(a, k * PERIOD, axis=1)[take]
        todo &= ~take
    assert not todo.any(), int(todo.sum())
    return out


rows = np.arange(H)[:, None]
cols = np.arange(W)[None, :]
in_mesh = (rows > RAIL[1]) & (cols > POST_L) & (cols < POST_R)
# tout ce qui n'est pas du grillage sous la lisse : cuisse, lambeaux du short, sandale, jambe
jm_low = ndi.binary_dilation(solid & in_mesh, iterations=10) & in_mesh
leg_hole = ndi.binary_dilation(leg, iterations=6) & in_mesh

panel = mesh_fill(torn, leg_hole, jm_low)
panel[..., 3] = np.where(leg & ~in_mesh, 0, panel[..., 3])   # (la jambe est entièrement sous la lisse)

fence = mesh_fill(torn, jm_low, jm_low)
# au-dessus du grillage : on ne garde que les poteaux, et une lisse reconstituée
keep = ~in_mesh & ((cols <= POST_L) | (cols >= POST_R))
fence[..., 3] = np.where(in_mesh | keep, fence[..., 3], 0)
strip = torn[RAIL[0] - 6: RAIL[1] + 6, RAIL_SAMPLE: RAIL_SAMPLE + 1]
fence[RAIL[0] - 6: RAIL[1] + 6, POST_L: POST_R + 1] = strip
# les poteaux ne gardent que leur propre silhouette (ni sandale ni main)
post_top = min(np.where(fg[:, 80])[0].min(), np.where(fg[:, 1340])[0].min())
fence[: post_top - 4, :, 3] = 0

leg_a = torn.copy()
leg_a[..., 3] = np.where(leg, 255, 0)

ys, xs = np.where(panel[..., 3] > 0)
px0, py0 = xs.min(), ys.min()
fys, fxs = np.where(fence[..., 3] > 0)
lys, lxs = np.where(leg)
for tag, s in (("mid", TORN_MID), ("big", TORN_BIG)):
    img = save(f"torn_{tag}", panel, s, thr=0.3)
    f_img = save(f"fence_{tag}", fence, s, thr=0.3)
    l_img = save(f"leg_{tag}", leg_a, s)
    manifest[f"fence_{tag}"].update(x=round((fxs.min() - px0) * s), y=round((fys.min() - py0) * s))
    manifest[f"leg_{tag}"].update(
        x=round((lxs.min() - px0) * s), y=round((lys.min() - py0) * s),
        px=round((KNEE[0] - lxs.min()) * s) / l_img.width, py=round((KNEE[1] - lys.min()) * s) / l_img.height,
    )
    manifest[f"torn_{tag}"].update(rail=round((RAIL[0] - py0) * s), tear_x=round((620 - px0) * s), tear_y=round((1080 - py0) * s))

# ---------------------------------------------------------------- objets
print("objets")
a = cut("objects/renault_fuego.png")
save("fuego", a, FUEGO_W / width_of(a))
a = clean_alpha(load(SRC / "objects/barbecue.png"))
save("barbecue", a, BBQ_H / height_of(a))
a = clean_alpha(load(SRC / "objects/stereo.png"))
save("stereo", a, STEREO_H / height_of(a))
save("stereo_cu", a, 0.7)

# ---------------------------------------------------------------- le boxer de Chuck
print("boxer")


def boxer(name: str) -> np.ndarray:
    """Vraie transparence ou faux damier clair, selon le fichier ; on ne garde que le chien."""
    a = load(SRC / f"characters/{name}.png")
    a = clean_alpha(a, thr=ALPHA) if (a[..., 3] < 255).any() else key_checker(a, floor=236, spread=10)
    # les petits traits de mouvement dessinés autour du chien deviendraient du bruit à cette taille :
    # c'est l'animation qui le fait bouger
    return max(components(a, join=0, min_area=30), key=lambda c: int((c[2][..., 3] > 0).sum()))[2]


calm, dancing = boxer("boxer_calm"), boxer("boxer_dancing")
# une seule échelle pour les deux poses : le chien ne change pas de taille en se mettant à danser
for tag, h in (("", BOXER_H), ("_mid", 70), ("_big", 100)):
    s = h / height_of(calm)
    save(f"boxer_calm{tag}", calm, s)
    save(f"boxer_dancing{tag}", dancing, s)

# le verre de pastis de Jean-Mi vient de la mission 003 (même personnage, même verre)
a = key_checker(load(ROOT / "public/assets/olive-storm/objects/pastis_glass.png"), floor=200, spread=14)
save("pastis", a, 10 / width_of(a))
save("pastis_cu", a, 30 / width_of(a))

# ---------------------------------------------------------------- effets
print("effets")
a = cut("effects/smoke.png")
save("smoke", a, 60 / width_of(a))
save("smoke_big", a, 150 / width_of(a))
a = cut("effects/flames.png")
save("flames", a, 44 / height_of(a))
save("flames_big", a, 120 / height_of(a))
# les ondes sonores : quatre arcs sur un faux damier, découpés un par un
waves = key_checker(load(SRC / "effects/sound_waves.png"), floor=225, spread=22)
arcs = sorted(components(waves, join=2, min_area=8000), key=lambda p: p[1])
assert len(arcs) == 4, len(arcs)
s_wave = 120 / arcs[-1][2].shape[0]
for i, (_, _, sub) in enumerate(arcs):
    save(f"wave_{i}", sub, s_wave)
save("wave_big", arcs[-1][2], 300 / arcs[-1][2].shape[0])

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
META.parent.mkdir(parents=True, exist_ok=True)
META.write_text(
    "// Fichier généré par scripts/build_bon_voisinage_assets.py — ne pas modifier à la main.\n"
    "// Tailles, positions (x, y) et pivots (px, py) des sprites dérivés.\n"
    f"export const SPRITES = {json.dumps(manifest, indent=1)} as const;\n"
)
print("ok —", len(manifest), "entrées")
