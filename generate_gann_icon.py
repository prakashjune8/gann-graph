import os
from PIL import Image, ImageDraw, ImageFont

def create_gann_icon():
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Dark Emerald Rounded Badge Background
    padding = 8
    badge_rect = [padding, padding, size - padding, size - padding]
    corner_radius = 56

    # Deep rich dark green background
    draw.rounded_rectangle(badge_rect, radius=corner_radius, fill=(12, 38, 26, 255))

    # 2. Outer Dual Metallic Gold Borders
    draw.rounded_rectangle(badge_rect, radius=corner_radius, outline=(255, 204, 51, 255), width=5)
    inner_padding = padding + 6
    inner_rect = [inner_padding, inner_padding, size - inner_padding, size - inner_padding]
    draw.rounded_rectangle(inner_rect, radius=corner_radius - 6, outline=(212, 160, 23, 200), width=2)

    # 3. K&E 8x8 Drafting Grid (Gold & Emerald)
    grid_start = 32
    grid_end = 224
    grid_step = (grid_end - grid_start) // 8  # 24 px per step

    # Minor grid lines
    for i in range(1, 8):
        pos = grid_start + i * grid_step
        # Vertical
        draw.line([(pos, grid_start), (pos, grid_end)], fill=(212, 160, 23, 90), width=1)
        # Horizontal
        draw.line([(grid_start, pos), (grid_end, pos)], fill=(212, 160, 23, 90), width=1)

    # Major Center Cartesian Axes (Thicker Gold)
    center_pos = grid_start + 4 * grid_step
    draw.line([(center_pos, grid_start - 4), (center_pos, grid_end + 4)], fill=(255, 215, 0, 220), width=3)
    draw.line([(grid_start - 4, center_pos), (grid_end + 4, center_pos)], fill=(255, 215, 0, 220), width=3)

    # 4. Master 45-Degree Gann Ray (Vibrant Flame Orange / Crimson)
    ray_start = (grid_start, grid_end)
    ray_end = (grid_end, grid_start)
    # Glow effect
    draw.line([ray_start, ray_end], fill=(255, 87, 34, 120), width=8)
    draw.line([ray_start, ray_end], fill=(255, 171, 0, 255), width=4)
    draw.line([ray_start, ray_end], fill=(255, 255, 255, 240), width=2)

    # Intersection Points (Nodes) along 1x1 45 deg
    for i in range(0, 9, 2):
        nx = grid_start + i * grid_step
        ny = grid_end - i * grid_step
        draw.ellipse([nx - 4, ny - 4, nx + 4, ny + 4], fill=(255, 215, 0, 255), outline=(139, 30, 30, 255), width=2)

    # 5. Swing Step Right-Angle Graphic (Classic Crimson)
    swing_pts = [
        (grid_start + 1 * grid_step, grid_end - 1 * grid_step),
        (grid_start + 3 * grid_step, grid_end - 1 * grid_step),
        (grid_start + 3 * grid_step, grid_end - 4 * grid_step),
        (grid_start + 6 * grid_step, grid_end - 4 * grid_step),
        (grid_start + 6 * grid_step, grid_end - 7 * grid_step),
        (grid_start + 8 * grid_step, grid_end - 7 * grid_step),
    ]
    for k in range(len(swing_pts) - 1):
        draw.line([swing_pts[k], swing_pts[k+1]], fill=(255, 50, 50, 240), width=3)

    # 6. Bold Typographic Plate at Bottom
    plate_rect = [36, 176, 220, 218]
    draw.rounded_rectangle(plate_rect, radius=8, fill=(18, 56, 38, 255), outline=(255, 204, 51, 240), width=2)

    # Try loading a clear bold font, fallback to default
    try:
        font = ImageFont.truetype("arialbd.ttf", 30)
    except Exception:
        try:
            font = ImageFont.truetype("segoeuib.ttf", 30)
        except Exception:
            font = ImageFont.load_default()

    # Draw "GANN" centered text
    text = "GANN"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2
    ty = 180

    # Drop shadow
    draw.text((tx + 2, ty + 2), text, font=font, fill=(0, 0, 0, 220))
    # Crisp Gold Text
    draw.text((tx, ty), text, font=font, fill=(255, 223, 70, 255))

    # Output paths
    ico_dest1 = r"D:\ANTIGRAVITY PROJECT FOLDER\gann_icon.ico"
    ico_dest2 = r"D:\ANTIGRAVITY PROJECT FOLDER\GANN GRAPH\gann_icon.ico"
    png_preview = r"D:\ANTIGRAVITY PROJECT FOLDER\gann_icon.png"

    img.save(png_preview, format="PNG")

    # Multi-resolution icon for Windows shell
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_dest1, format="ICO", sizes=icon_sizes)
    img.save(ico_dest2, format="ICO", sizes=icon_sizes)
    print(f"Generated multi-resolution ICO at: {ico_dest1}")

if __name__ == "__main__":
    create_gann_icon()
