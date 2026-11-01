import struct
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent
source = here.parent / "brand" / "logo.png"
target = here / "updater" / "Liro-Updater.ico"

sizes = [16, 24, 32, 48, 64, 128, 256]
master = Image.open(source).convert("RGBA")


def dib(image):
    width, height = image.size
    pixels = image.load()
    xor = bytearray()
    for y in range(height - 1, -1, -1):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            xor += bytes((b, g, r, a))
    row_bytes = -(-width // 8)
    and_mask = bytearray()
    for _ in range(height):
        and_mask += bytes(row_bytes)
    header = struct.pack(
        "<IiiHHIIiiII",
        40,
        width,
        height * 2,
        1,
        32,
        0,
        len(xor) + len(and_mask),
        0,
        0,
        0,
        0,
    )
    return header + bytes(xor) + bytes(and_mask)


frames = []
for size in sizes:
    image = master.resize((size, size), Image.LANCZOS)
    frames.append((size, dib(image)))

entries = bytearray()
offset = 6 + 16 * len(frames)
for size, body in frames:
    byte = 0 if size >= 256 else size
    entries += struct.pack("<BBBBHHII", byte, byte, 0, 0, 1, 32, len(body), offset)
    offset += len(body)

with open(target, "wb") as file:
    file.write(struct.pack("<HHH", 0, 1, len(frames)))
    file.write(entries)
    for _, body in frames:
        file.write(body)

print(target, target.stat().st_size, "байт")
