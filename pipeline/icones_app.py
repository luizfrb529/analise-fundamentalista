"""Gera os ícones do app (tela inicial do celular) a partir do símbolo do site: moldura verde com a linha de gráfico.
Uso: python pipeline/icones_app.py  (precisa do Pillow; só roda quando o desenho mudar)."""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "assets" / "app"
FUNDO = (11, 12, 14)        # --bg do tema escuro
VERDE = (51, 196, 122)      # --acento
PONTOS = [(8, 22), (13, 16), (17, 19), (24, 10)]   # mesma linha do ícone do site (caixa de 32)


def desenhar(n: int, escala_moldura: float = 0.58) -> Image.Image:
    k = 4   # desenha 4x maior e reduz, para bordas suaves
    N = n * k
    im = Image.new("RGB", (N, N), FUNDO)
    d = ImageDraw.Draw(im)
    lado = N * escala_moldura
    x0 = (N - lado) / 2
    borda = lado * 0.055
    d.rounded_rectangle([x0, x0, x0 + lado, x0 + lado], radius=lado * 0.24, outline=VERDE, width=round(borda))
    # linha do gráfico ocupando cerca de 60% da largura da moldura, centralizada
    s = lado * 0.60 / 16   # a linha vai de x=8 a x=24 (16 unidades)
    pts = [(N / 2 + (px - 16) * s, N / 2 + (py - 16) * s) for px, py in PONTOS]
    w = round(lado * 0.075)
    d.line(pts, fill=VERDE, width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=VERDE)
    return im.resize((n, n), Image.LANCZOS)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for n in (192, 512):
        desenhar(n).save(SAIDA / f"icone-{n}.png", optimize=True)
        desenhar(n, 0.46).save(SAIDA / f"icone-{n}-maskable.png", optimize=True)   # Android recorta em círculo: símbolo menor
    desenhar(180).save(SAIDA / "apple-touch-icon.png", optimize=True)
    desenhar(32).save(SAIDA / "favicon-32.png", optimize=True)
    print("ícones em", SAIDA)


if __name__ == "__main__":
    main()
