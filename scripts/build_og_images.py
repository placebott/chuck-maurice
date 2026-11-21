"""Images de partage (Open Graph, 1200x630) + favicon.

Une image par page : c'est elle qui s'affiche quand un lien est partagé
(WhatsApp, Discord, X, Facebook...). Lancer : npm run assets:og
Polices : Bowlby One et Space Mono (licence OFL), copiées dans scripts/fonts.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SPR = ROOT / "public/assets/sprites"
GD = ROOT / "public/grand-debarras/assets"
OUT = ROOT / "public/og"
FONTS = Path(__file__).resolve().parent / "fonts"
W, H = 1200, 630
BG, INK, MUSTARD, RED, GREEN = "#120a14", "#f6ecd9", "#ffc928", "#ff4338", "#a4d83c"


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def cover(path, dim=0.45):
    """Décor pixel art agrandi sans lissage, assombri à gauche pour le texte."""
    im = Image.open(path).convert("RGB")
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.NEAREST)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((x, y, x + W, y + H)).convert("RGBA")
    shade = Image.new("L", (W, 1))
    shade.putdata([round(255 * (0.93 - (0.93 - dim) * min(1, max(0, (i - 500) / 500)))) for i in range(W)])
    veil = Image.new("RGBA", (W, H), BG)
    veil.putalpha(shade.resize((W, H)))
    return Image.alpha_composite(im, veil)


def plain(color):
    im = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(im)
    for i in range(0, 360, 15):  # rayons, comme sur l'accueil
        d.pieslice((W - 330 - 900, H // 2 - 900, W - 330 + 900, H // 2 + 900), i, i + 7.5, fill=color)
    return im


def sprite(im, path, height, right, bottom, smooth=False):
    s = Image.open(path).convert("RGBA")
    k = height / s.height
    s = s.resize((round(s.width * k), height), Image.LANCZOS if smooth else Image.NEAREST)
    im.alpha_composite(s, (right - s.width, bottom - s.height))


def text(im, kicker, lines, tagline, size):
    d = ImageDraw.Draw(im)
    mono, big = font("SpaceMono-Bold.ttf", 24), font("BowlbyOne-Regular.ttf", size)
    x, y = 64, 70
    kw = d.textlength(kicker, font=mono)
    d.rectangle((x, y, x + kw + 36, y + 50), outline=RED, width=4)
    d.text((x + 18, y + 9), kicker, font=mono, fill=RED)
    y += 92
    for i, line in enumerate(lines):
        o = max(4, size // 16)
        d.text((x + 2 * o, y + 2 * o), line, font=big, fill="#000000")
        d.text((x + o, y + o), line, font=big, fill=RED)
        d.text((x, y), line, font=big, fill=INK if i == 0 else MUSTARD)
        y += round(size * 1.1)
    d.text((x, y + 34), tagline, font=font("SpaceMono-Bold.ttf", 28), fill=GREEN)
    d.rectangle((0, H - 62, W, H), fill=MUSTARD)
    d.line((0, H - 62, W, H - 62), fill="#000000", width=4)
    d.text((x, H - 50), "CHUCKMAURICE.COM — MINI-JEUX GRATUITS, SANS TÉLÉCHARGEMENT", font=mono, fill=BG)


def save(im, name):
    OUT.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT / name, "JPEG", quality=88, optimize=True)
    print("og/" + name)


def main():
    im = plain("#24122a")
    sprite(im, SPR / "chuck_victory.png", 480, 1030, 560)
    sprite(im, SPR / "jar_closed.png", 200, 1170, 560)
    text(im, "LE MINISTÈRE DU CONDIMENT PRÉSENTE", ["CHUCK", "MAURICE"], "MINI-JEUX D'ARCADE ABSURDES", 112)
    save(im, "accueil.jpg")

    im = cover(SPR / "kitchen.png")
    sprite(im, SPR / "jar_closed.png", 200, 850, 560)
    sprite(im, SPR / "chuck_twist.png", 470, 1170, 560)
    text(im, "MISSION 001", ["OPÉRATION", "CORNICHON"], "20 SECONDES. UN BOCAL.", 92)
    save(im, "cornichon.jpg")

    im = cover(SPR / "kitchen.png")
    sprite(im, SPR / "saucissonator/chuck_cutting.png", 470, 1170, 560)
    text(im, "MISSION 002", ["SAUCISSONATOR", "3000"], "12 RONDELLES. 25 SECONDES.", 78)
    save(im, "saucissonator.jpg")

    im = cover(SPR / "olive-storm/garden.png")
    sprite(im, SPR / "olive-storm/chuck_aiming.png", 430, 1180, 560)
    text(im, "MISSION 003", ["OLIVE", "STORM"], "OPÉRATION BALISTIQUE APÉRITIVE", 124)
    save(im, "olive-storm.jpg")

    im = cover(SPR / "bon-voisinage/duel.png")
    sprite(im, SPR / "bon-voisinage/jm_rage.png", 330, 880, 560)
    sprite(im, SPR / "bon-voisinage/chuck_sunglasses_cu.png", 480, 1180, 560)
    text(im, "MISSION 004", ["MAURIIIIICE", "!!!"], "OPÉRATION BON VOISINAGE", 92)
    save(im, "mauriiiiice.jpg")

    im = plain("#2a1c63")
    sprite(im, GD / "chuck/idle.webp", 540, 1160, 568, smooth=True)
    text(im, "MISSION 005", ["LE GRAND", "DÉBARRAS"], "LE PUZZLE DE JEAN-MI", 104)
    save(im, "grand-debarras.jpg")

    im = plain("#3a1420")
    sprite(im, SPR / "chuck_cool.png", 480, 1090, 560)
    text(im, "MINISTÈRE DU CONDIMENT — SERVICE DU COURRIER", ["LE COURRIER", "DES FANS"], "ÉCRIVEZ À CHUCK. IL LIT TOUT.", 92)
    save(im, "courrier.jpg")

    # Favicon et icône d'écran d'accueil : le bocal.
    jar = Image.open(SPR / "jar_closed.png").convert("RGBA")
    sq = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    sq.alpha_composite(jar, ((96 - jar.width) // 2, (96 - jar.height) // 2))
    sq.save(ROOT / "public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    touch = Image.new("RGBA", (180, 180), BG)
    big = jar.resize((jar.width * 3 // 2, jar.height * 3 // 2), Image.NEAREST)
    touch.alpha_composite(big, ((180 - big.width) // 2, (180 - big.height) // 2))
    touch.convert("RGB").save(ROOT / "public/apple-touch-icon.png")
    print("favicon.ico, apple-touch-icon.png")


if __name__ == "__main__":
    main()
