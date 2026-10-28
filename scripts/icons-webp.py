"""
把 public/img/weather/*.png（320×320）转成 128 和 256 像素的 WebP，页面用 srcset 按屏幕密度选。
原图标有改动时重新运行：python3 scripts/icons-webp.py（需要 Pillow：pip install Pillow）
"""
import glob
import os

from PIL import Image

DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'weather')
for path in sorted(glob.glob(os.path.join(DIR, '*.png'))):
    name = os.path.basename(path)[:-4]
    image = Image.open(path).convert('RGBA')
    for size in (128, 256):
        image.resize((size, size), Image.LANCZOS).save(os.path.join(DIR, f'{name}-{size}.webp'), 'WEBP', quality=82, method=6)
    print(name)
