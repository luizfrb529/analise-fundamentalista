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
            else:
                falhas.append(t)
        except requests.RequestException:
            falhas.append(t)
    disponiveis = sorted(p.stem for p in DESTINO.glob("*.svg"))
    (DESTINO / "_index.json").write_text(json.dumps(disponiveis), encoding="utf-8")
    print(f"logos: {baixados} baixados, {len(disponiveis)} disponíveis, sem logo: {falhas}")


if __name__ == "__main__":
    main()
