#!/usr/bin/env python3
"""Composes preview.png, the marketplace card, from a render of the panel.

Usage: tools/render-preview-card.py LAYOUT.png

LAYOUT.png is the expanded panel on the Layout page, rendered offscreen at
device scale 2 with the synthetic displays (DP-1 Example Studio, DP-2
Example Portable) in the ristretto theme, like the other screenshots.

The marketplace card shows only a strip from the middle, about 2.7 times as
wide as it is tall, and the websites crop to 16:9. So the panel is shown
large and runs off the edges, with the display stage and the Resolution,
Refresh, Scale and Rotation controls in the middle, where every crop keeps
them."""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

repo = Path(__file__).resolve().parent.parent
wallpaper = Path("/usr/share/omarchy/themes/ristretto/backgrounds/0-launch.webp")
W, H = 2560, 1600
ZOOM = 1.12


def cover(image, width, height):
    scale = max(width / image.width, height / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left, top = (image.width - width) // 2, (image.height - height) // 2
    return image.crop((left, top, left + width, top + height))


# The capture window is larger than the panel; keep only the panel.
shot = Image.open(sys.argv[1]).convert("RGBA")
corner = Image.new("RGBA", shot.size, shot.getpixel((shot.width - 1, shot.height - 1)))
panel = shot.crop(ImageChops.difference(shot, corner).convert("L").point(lambda v: 255 if v > 8 else 0).getbbox())
panel = panel.resize((round(panel.width * ZOOM), round(panel.height * ZOOM)), Image.LANCZOS)

# The wallpaper, softened and dimmed so the panel reads first.
back = cover(Image.open(wallpaper).convert("RGB"), W, H).filter(ImageFilter.GaussianBlur(28))
card = ImageEnhance.Brightness(back).enhance(0.45).convert("RGBA")

# The stage and the inspector's first controls sit across the vertical middle.
x, y = 150, 170
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((x + 16, y + 36, x + panel.width + 16, y + panel.height + 36), 36, fill=(0, 0, 0, 190))
card = Image.alpha_composite(card, shadow.filter(ImageFilter.GaussianBlur(36)))
card.alpha_composite(panel, (x, y))

card.convert("RGB").save(repo / "preview.png", optimize=True)
print("wrote", repo / "preview.png", card.size)
