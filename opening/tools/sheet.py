# Tile captured review frames into one contact sheet: python tools/sheet.py out.jpg a0,a1,...
import sys
from PIL import Image, ImageDraw
out, names = sys.argv[1], sys.argv[2].split(',')
W, H, cols = 480, 270, 4
rows = (len(names) + cols - 1) // cols
S = Image.new('RGB', (W * cols, H * rows), (255, 0, 255))
for i, n in enumerate(names):
    im = Image.open(f'versions/frames/{n}.jpg').convert('RGB').resize((W, H))
    ImageDraw.Draw(im).text((4, 4), n, fill=(255, 0, 0))
    S.paste(im, ((i % cols) * W, (i // cols) * H))
S.save(out)
