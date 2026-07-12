# -*- coding: utf-8 -*-
r"""
gen_icon.py — 購買サーチ 専用アイコンを生成（統合ハブ hub\gen_icon.py 方式を踏襲）。
デザイン: 角丸スクエアの対角グラデ(kobaiブランド シアン→ブルー)＋白い虫めがね(🔎=サーチ)。
出力: icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png / icon-64.png（このフォルダ）。
4倍スーパーサンプリングでアンチエイリアス。PILのみ・¥0。
"""
import os, math
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
CYAN = (34, 211, 238)      # #22d3ee (kobai --cyan)
BLUE = (59, 130, 246)      # #3b82f6 (header gradient blue)
WHITE = (255, 255, 255)


def diagonal_gradient(size, c1, c2):
    """左上c1→右下c2の対角グラデ画像(RGB)。"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = (
                int(c1[0] + (c2[0] - c1[0]) * t),
                int(c1[1] + (c2[1] - c1[1]) * t),
                int(c1[2] + (c2[2] - c1[2]) * t),
            )
    return img


def render(size, maskable=False):
    S = size * 4  # supersample
    grad = diagonal_gradient(S, CYAN, BLUE).convert("RGBA")

    # 角丸マスク（maskableは全面ブリード＝角丸なし、システムが形を切る）
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if maskable:
        out.paste(grad, (0, 0))
    else:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        out.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(out)
    cx = cy = S / 2
    # maskableは安全域(中央~66%)に収める＝虫めがねをやや小さく
    scale = 0.80 if maskable else 1.0
    # レンズの中心（全体を左上へ寄せ、右下にハンドルを伸ばす）
    lx = cx - S * 0.06 * scale
    ly = cy - S * 0.06 * scale
    r_out = S * 0.24 * scale            # レンズ外半径
    ring = S * 0.055 * scale            # リング太さ
    r_in = r_out - ring                 # レンズ内半径

    # ソフトシャドウ（わずかに下方へ）
    sh = S * 0.012
    d.ellipse([lx - r_out + sh, ly - r_out + sh, lx + r_out + sh, ly + r_out + sh],
              fill=(10, 20, 40, 55))

    # ハンドル（レンズ右下 45度・白の丸端太線）
    ha = math.radians(45)
    h1 = (lx + r_out * 0.86 * math.cos(ha), ly + r_out * 0.86 * math.sin(ha))
    h2 = (lx + (r_out + S * 0.17 * scale) * math.cos(ha), ly + (r_out + S * 0.17 * scale) * math.sin(ha))
    d.line([h1, h2], fill=WHITE, width=int(ring * 1.25))
    hr = ring * 0.62
    d.ellipse([h2[0] - hr, h2[1] - hr, h2[0] + hr, h2[1] + hr], fill=WHITE)

    # レンズのリング（白い環）＝外円白→内側をグラデで抜く
    d.ellipse([lx - r_out, ly - r_out, lx + r_out, ly + r_out], fill=WHITE)
    glass = grad.crop((int(lx - r_in), int(ly - r_in), int(lx + r_in), int(ly + r_in)))
    gmask = Image.new("L", glass.size, 0)
    ImageDraw.Draw(gmask).ellipse([0, 0, glass.size[0] - 1, glass.size[1] - 1], fill=255)
    out.paste(glass, (int(lx - r_in), int(ly - r_in)), gmask)

    # レンズ内のハイライト（左上の小さな白い弧）＝ガラス感
    d = ImageDraw.Draw(out)
    hl = r_in * 0.62
    d.arc([lx - hl, ly - hl, lx + hl, ly + hl], start=200, end=265,
          fill=(255, 255, 255, 210), width=int(ring * 0.45))

    return out.resize((size, size), Image.LANCZOS)


def main():
    render(512).save(os.path.join(HERE, "icon-512.png"))
    render(192).save(os.path.join(HERE, "icon-192.png"))
    render(512, maskable=True).save(os.path.join(HERE, "icon-maskable-512.png"))
    render(180).save(os.path.join(HERE, "apple-touch-icon.png"))
    render(64).save(os.path.join(HERE, "icon-64.png"))
    print("icons written to", HERE)


if __name__ == "__main__":
    main()
