# 生成 DeepSeek Harness 图标（多分辨率 .ico）
from PIL import Image, ImageDraw

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角方块底
corner = 56
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=corner, fill=(0, 0, 0, 0))
mask = Image.new("L", (S, S), 0)
dm = ImageDraw.Draw(mask)
dm.rounded_rectangle([0, 0, S - 1, S - 1], radius=corner, fill=255)

# 垂直渐变背景（DeepSeek 蓝）
top = (77, 107, 254)
bottom = (23, 42, 94)
grad = Image.new("RGBA", (1, S))
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    grad.putpixel((0, y), c + (255,))
grad = grad.resize((S, S))
img.paste(grad, (0, 0), mask)

# 画一只简约鲸鱼
whale = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dw = ImageDraw.Draw(whale)
cx, cy = S // 2, S // 2
w = 150  # 体宽
h = 86   # 体高
# 身体（椭圆）
dw.ellipse([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], fill=(255, 255, 255, 255))
# 尾巴（三角形 + 尾鳍）
tx = cx + w // 2 - 6
dw.polygon([(tx, cy - 6), (S - 24, cy - 40), (S - 24, cy + 40), (tx, cy + 6)], fill=(255, 255, 255, 255))
# 眼睛
dw.ellipse([cx - w // 2 + 26, cy - 18, cx - w // 2 + 40, cy - 4], fill=(23, 42, 94, 255))
# 肚皮波浪线
dw.arc([cx - w // 2 + 14, cy + 8, cx + w // 2 - 30, cy + 40], start=15, end=165, fill=(200, 214, 255, 255), width=6)
img = Image.alpha_composite(img, whale)

# 输出多分辨率 .ico
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [img.resize((s, s), Image.LANCZOS) for s in sizes]
frames[0].save(
    r"C:\Users\AzurLane\DeepSeekHarnessDesktop\build\app.ico",
    format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:],
)
print("app.ico written:", sizes)
