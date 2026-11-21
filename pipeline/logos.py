"""Baixa o logo de cada ativo do universo para assets/logos/<TICKER>.svg.

Fonte: icons.brapi.dev (SVG por ticker da B3, inclusive BDRs). Só baixa o que falta;
para trocar um logo, apague o arquivo e rode de novo. Sem logo, o site mostra as iniciais.
Uso: python pipeline/logos.py [--todos]
"""
import json
import re
import sys
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "assets" / "logos"
URL = "https://icons.brapi.dev/icons/{}.svg"
URL_EUA = "https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/{}.png"   # reserva para stocks americanas
URL_FMP = "https://financialmodelingprep.com/image-stock/{}.png"               # segunda reserva (logos públicos da Financial Modeling Prep)


def so_branco(conteudo: bytes) -> bool:
    """Logo desenhado em branco sobre fundo transparente (feito para fundo escuro): some no círculo claro do site."""
    from io import BytesIO
    try:
        from PIL import Image
        im = Image.open(BytesIO(conteudo)).convert("RGBA").resize((64, 64))
    except Exception:
        return False
    vis = [(r, g, b) for r, g, b, a in im.getdata() if a > 40]
    return bool(vis) and sum(1 for c in vis if sum(c) < 600) / 4096 < 0.03


def png_em_svg(conteudo: bytes) -> str:
    """Logo em PNG embutido num SVG, para o site continuar lendo um único formato."""
    import base64
    from io import BytesIO
    try:
        from PIL import Image
        w, h = Image.open(BytesIO(conteudo)).size
    except Exception:
        w = h = 256
    b64 = base64.b64encode(conteudo).decode()
    fundo = f'<rect width="{w}" height="{h}" fill="#1f2937"/>' if so_branco(conteudo) else ""   # logo branco: fundo escuro
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{fundo}<image width="{w}" height="{h}" href="data:image/png;base64,{b64}"/></svg>\n'


def svg_valido(txt: str) -> bool:
    t = txt.lstrip()[:400].lower()
    return ("<svg" in t) and ("<script" not in txt.lower())


def normalizar(txt: str) -> str:
    """Garante viewBox no <svg> para o logo escalar (sem ele o navegador corta o desenho ao reduzir)."""
    m = re.search(r"<svg\b[^>]*>", txt)
    if not m or "viewbox" in m.group(0).lower():
        return txt
    w = re.search(r'\bwidth="([\d.]+)', m.group(0))
    h = re.search(r'\bheight="([\d.]+)', m.group(0))
    if not (w and h):
        return txt
    tag = m.group(0)[:-1].rstrip("/") + f' viewBox="0 0 {w.group(1)} {h.group(1)}"' + (" />" if m.group(0).endswith("/>") else ">")
    return txt[:m.start()] + tag + txt[m.end():]


def main():
    if "--normalizar" in sys.argv:
        for arq in DESTINO.glob("*.svg"):
            arq.write_text(normalizar(arq.read_text(encoding="utf-8")), encoding="utf-8")
        print("logos normalizados")
        return
    todos = "--todos" in sys.argv
    DESTINO.mkdir(parents=True, exist_ok=True)
    universo = json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))
    fiis = RAIZ / "data" / "fiis.json"
    if fiis.exists():
        universo += [{"ticker": f["ticker"]} for f in json.loads(fiis.read_text(encoding="utf-8"))]
    sessao = requests.Session()
    sessao.headers["User-Agent"] = "analise-fundamentalista/1.0"
    baixados, falhas = 0, []
    for a in universo:
        t = a["ticker"]
        arq = DESTINO / f"{t}.svg"
        if arq.exists() and not todos:
            continue
        try:
            r = sessao.get(URL.format(t), timeout=20)
            if r.status_code == 200 and svg_valido(r.text):
                arq.write_text(normalizar(r.text), encoding="utf-8")
                baixados += 1
            elif a.get("ticker_exterior") and (a.get("tipo") == "STOCK_US" or str(a.get("tipo", "")).startswith("BDR")):
                # stocks e BDRs: logo pelo código americano, em dois repositórios públicos de ícones;
                # prefere a versão colorida (a toda branca ganha fundo escuro em png_em_svg)
                pngs = []
                for url in (URL_FMP, URL_EUA):
                    r2 = sessao.get(url.format(a["ticker_exterior"]), timeout=20)
                    if r2.status_code == 200 and r2.headers.get("content-type", "").startswith("image/png") and len(r2.content) > 500:
                        pngs.append(r2.content)
                if pngs:
                    arq.write_text(png_em_svg(next((x for x in pngs if not so_branco(x)), pngs[0])), encoding="utf-8")
                    baixados += 1
                else:
                    falhas.append(t)
            else:
                falhas.append(t)
        except requests.RequestException:
            falhas.append(t)
    disponiveis = sorted(p.stem for p in DESTINO.glob("*.svg"))
    (DESTINO / "_index.json").write_text(json.dumps(disponiveis), encoding="utf-8")
    print(f"logos: {baixados} baixados, {len(disponiveis)} disponíveis, sem logo: {falhas}")


if __name__ == "__main__":
    main()
