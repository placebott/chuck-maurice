"""
Pipeline d'assets — OLIVE STORM (mission 003)

Les 15 illustrations de public/assets/olive-storm/ ne sont jamais modifiées :
on en tire des dérivés prêts pour le jeu dans public/assets/sprites/olive-storm/
(détourage du faux damier quand il existe, réduction à la résolution 480x270, alpha binaire).

Usage :  python scripts/build_olive_assets.py   (pillow, numpy, scipy)
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from sprite_tools import clean_alpha, components, downscale, key_checker, load, trim

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "assets" / "olive-storm"
OUT = ROOT / "public" / "assets" / "sprites" / "olive-storm"
OUT.mkdir(parents=True, exist_ok=True)

GAME_W, GAME_H = 480, 270
CHUCK_VICTORY_H = 172     # Chuck, poing levé : même carrure que dans les deux autres missions
JEANMI_SCALE = 150 / 1536  # les trois poses partagent la même échelle
SPOON_W = 84              # une énorme cuillère
OLIVE_W = 11
SPLAT_W = 34
GLASS_W = 60
PAN_W = 80
FAN_H = 62
PASTIS_W = 17
WINDOW_W = 128
BOXER_W = 112

manifest: dict[str, dict] = {}


def save(name: str, a, scale: float) -> Image.Image:
    img = downscale(trim(a), scale)
    img.save(OUT / f"{name}.png", optimize=True)
    manifest[name] = {"w": img.width, "h": img.height}
    print(f"  {name:18s} {img.width:4d} x {img.height}")
    return img


def to_width(a, w: int) -> float:
    return w / trim(a).shape[1]


print("personnages")
vic = clean_alpha(load(SRC / "characters/chuck_olive_victory.png"))
s_chuck = CHUCK_VICTORY_H / trim(vic).shape[0]
save("chuck_hero", vic, s_chuck)
save("chuck_aiming", clean_alpha(load(SRC / "characters/chuck_aiming.png")), s_chuck)
b = key_checker(load(SRC / "characters/boxer_intercept.png"))
save("boxer_intercept", b, to_width(b, BOXER_W))
save("jeanmi_idle", clean_alpha(load(SRC / "characters/jeanmi_idle.png")), JEANMI_SCALE)
save("jeanmi_hit", clean_alpha(load(SRC / "characters/jeanmi_hit.png")), JEANMI_SCALE)
save("jeanmi_angry", key_checker(load(SRC / "characters/jeanmi_angry.png")), JEANMI_SCALE)

print("objets")
a = clean_alpha(load(SRC / "objects/spoon_launcher.png"))
save("spoon", a, to_width(a, SPOON_W))
a = clean_alpha(load(SRC / "objects/olive.png"))
save("olive", a, to_width(a, OLIVE_W))
a = key_checker(load(SRC / "objects/olive_splat.png"))
save("olive_splat", a, to_width(a, SPLAT_W))
a = clean_alpha(load(SRC / "objects/cocktail_glass.png"))
save("glass", a, to_width(a, GLASS_W))
a = key_checker(load(SRC / "objects/pan.png"))
save("pan", a, to_width(a, PAN_W))
a = key_checker(load(SRC / "objects/pastis_glass.png"), floor=200, spread=14)
save("pastis", a, to_width(a, PASTIS_W))

# le ventilateur et son hélice sont deux dessins dans le même fichier
fan = clean_alpha(load(SRC / "objects/fan.png"))
parts = sorted(components(fan, join=8, min_area=20000), key=lambda p: p[1])
assert len(parts) == 2, len(parts)
s_fan = FAN_H / parts[0][2].shape[0]
save("fan", parts[0][2], s_fan)
save("fan_blades", parts[1][2], s_fan * 0.62)   # ramenée au diamètre de la grille

print("décors")
a = clean_alpha(load(SRC / "backgrounds/window_open.png"))
save("window", a, to_width(a, WINDOW_W))
g = Image.open(SRC / "backgrounds/jeanmi_garden.png").convert("RGB").resize((GAME_W, GAME_H), Image.BOX)
g.save(OUT / "garden.png", optimize=True)
manifest["garden"] = {"w": GAME_W, "h": GAME_H}
print(f"  {'garden':18s} {GAME_W:4d} x {GAME_H}")

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
print("ok —", len(manifest), "entrées")
