"""Histórico de rendimentos por cota dos FIIs no Investidor10 (investidor10.com.br), usado para os meses antes
dos avisos oficiais do FundosNet e do informe mensal da CVM. Valores já na base de cotas atual (o site recalcula
desdobramentos e grupamentos). Sempre conferido com as fontes oficiais nos meses em comum (rendimentos_fii.py).
Cache local por fundo; o histórico antigo não muda."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

CACHE = Path(__file__).resolve().parents[1] / "data" / "fontes" / "investidor10"   # guardado no repositório: o robô não depende do site no ar
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def historico(ticker: str, dias_cache: float = 30, tipo: str = "fiis") -> dict:
    """{AAAA-MM (mês da data com): valor por cota na base atual}, pela tabela de proventos da página do fundo
    (8 casas decimais; a API do gráfico arredonda para 2, o que distorce fundos de cota barata)."""
    import html as H
    CACHE.mkdir(parents=True, exist_ok=True)
    arq = CACHE / f"{ticker}.json"
    if arq.exists() and time.time() - arq.stat().st_mtime < dias_cache * 86400:
        return json.loads(arq.read_text(encoding="utf-8"))
    try:
        h = S.get(f"https://investidor10.com.br/{tipo}/{ticker.lower()}/", headers=UA).text
    except Exception as e:
        print(f"Investidor10 {ticker}: {e}; usado o histórico guardado")
        return json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}
    out = {}
    for linha in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
        tds = [H.unescape(re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", linha, re.S)]
        if len(tds) < 4 or not re.fullmatch(r"\d{2}/\d{2}/\d{4}", tds[1]) or not re.match(r"\s*\d+,\d+", tds[3]):
            continue
        if not re.search(r"dividend|rendiment|jcp|juros", tds[0], re.I):      # amortização fica de fora (devolve capital)
            continue
        dd, mm, aa = tds[1].split("/")
        v = float(re.match(r"\s*([\d.]+,\d+)", tds[3]).group(1).replace(".", "").replace(",", "."))
        out[f"{aa}-{mm}"] = round(out.get(f"{aa}-{mm}", 0.0) + v, 8)
    out = dict(sorted(out.items()))
    if not out and arq.exists():          # página mudou ou veio vazia: mantém o que já tinha
        return json.loads(arq.read_text(encoding="utf-8"))
    arq.write_text(json.dumps(out), encoding="utf-8")
    time.sleep(2)
    return out


if __name__ == "__main__":
    for t in sys.argv[1:]:
        h = historico(t)
        print(t, len(h), min(h) if h else None, max(h) if h else None)
