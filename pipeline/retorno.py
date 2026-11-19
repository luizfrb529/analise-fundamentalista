"""Dados da página Retorno total.

Para cada ativo grava data/retorno/<TICKER>.json com a série semanal (sexta-feira) de:
  fechamento (ajustado só por desdobramento), fechamento ajustado por proventos (Yahoo "Adj Close")
  e proventos em dinheiro por ação pagos na semana (data ex, mesma base do fechamento).
Grava também data/retorno/_benchmarks.json com CDI e IPCA mensais (Banco Central, SGS 4391 e 433)
e o Ibovespa semanal, para as linhas de comparação (CDI, IPCA + X% e Ibovespa).

Uso: python pipeline/retorno.py
"""
import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "retorno"
ANOS = 16
HOJE_ANO = dt.date.today().year


def gravar(caminho: Path, obj):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def serie_semanal(df: pd.DataFrame) -> list:
    d = df.dropna(subset=["Close"])
    fech = d["Close"].resample("W-FRI").last()
    aj = d["Adj Close"].resample("W-FRI").last() if "Adj Close" in d else fech
    prov = d["Dividends"].fillna(0).resample("W-FRI").sum() if "Dividends" in d else fech * 0
    out = []
    for data, v in fech.dropna().items():
        out.append([data.strftime("%Y-%m-%d"), round(float(v), 4), round(float(aj.get(data, v)), 4), round(float(prov.get(data, 0) or 0), 6)])
    return out


def mensal_bcb(serie: int) -> list:
    """[[AAAA-MM, taxa do mês em fração], ...] desde ANOS atrás."""
    hoje = dt.date.today()
    ini = hoje.replace(year=hoje.year - ANOS, day=1)
    out, a = [], ini
    while a <= hoje:                                  # a API limita a janela a 10 anos
        b = min(hoje, a.replace(year=a.year + 9))
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json"
               f"&dataInicial={a:%d/%m/%Y}&dataFinal={b:%d/%m/%Y}")
        dados = None
        for tentativa in range(4):                    # a API do BCB às vezes responde vazio; tenta de novo furando o cache
            try:
                dados = S.get(f"{url}&_={int(dt.datetime.now().timestamp())}{tentativa}", headers={"Cache-Control": "no-cache"}).json()
                break
            except Exception:
                import time
                time.sleep(3 * (tentativa + 1))
        if dados is None:
            raise RuntimeError(f"BCB série {serie} indisponível")
        for x in dados:
            d, m, y = x["data"].split("/")
            out.append([f"{y}-{m}", float(x["valor"]) / 100])
        a = b + dt.timedelta(days=1)
    vistos, lim = set(), []
    for k, v in out:
        if k not in vistos:
            vistos.add(k)
            lim.append([k, v])
    return lim


def ifix_b3() -> list:
    """Fechamento diário oficial do IFIX (B3, estatísticas do índice), agrupado por semana (sexta-feira)."""
    import base64
    serie = {}
    for ano in range(HOJE_ANO - ANOS, HOJE_ANO + 1):
        chave = base64.b64encode(json.dumps({"index": "IFIX", "language": "pt-br", "year": str(ano)}).encode()).decode()
        try:
            j = S.get(f"https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{chave}").json()
        except Exception as e:
            print(f"IFIX {ano}: {e}")
            continue
        for linha in j.get("results") or []:
            dia = linha.get("day")
            for mes in range(1, 13):
                v = linha.get(f"rateValue{mes}")
                if v:
                    try:
                        serie[dt.date(ano, mes, int(dia))] = float(v.replace(".", "").replace(",", "."))
                    except ValueError:
                        pass
    if not serie:
        return []
    s = pd.Series(serie).sort_index()
    s.index = pd.to_datetime(s.index)
    return [[d.strftime("%Y-%m-%d"), round(float(v), 2)] for d, v in s.resample("W-FRI").last().dropna().items()]


def main():
    universo = json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))
    fiis_ = RAIZ / "data" / "fiis.json"
    fiis = json.loads(fiis_.read_text(encoding="utf-8")) if fiis_.exists() else []
    tickers = [a["ticker"] for a in universo] + [f["ticker"] for f in fiis]
    dfs = S.precos_yf([t + ".SA" for t in tickers] + ["^BVSP"], anos=ANOS)
    n = 0
    for t in tickers:
        df = dfs.get(t + ".SA")
        if df is None or df.empty:
            print(f"{t}: sem preço")
            continue
        gravar(SAIDA / f"{t}.json", {"ticker": t, "fonte": "Yahoo Finance (B3)", "colunas": ["data", "fechamento", "ajustado", "proventos"], "semanal": serie_semanal(df)})
        n += 1
    anterior = {}
    if (SAIDA / "_benchmarks.json").exists():
        anterior = json.loads((SAIDA / "_benchmarks.json").read_text(encoding="utf-8"))
    bench = {"atualizado_em": dt.datetime.now().isoformat(timespec="seconds"),
             "fonte": "Banco Central (SGS 4391 CDI mensal e 433 IPCA mensal) e Yahoo Finance (Ibovespa)"}
    for chave, serie in (("cdi", 4391), ("ipca", 433)):
        try:
            bench[chave] = mensal_bcb(serie)
        except Exception as e:                        # mantém a série anterior em vez de apagar a página
            print(f"{chave}: {e}; mantida a série anterior")
            bench[chave] = anterior.get(chave, [])
    ib = dfs.get("^BVSP")
    if ib is not None and not ib.empty:
        bench["ibov"] = [[d.strftime("%Y-%m-%d"), round(float(v), 2)] for d, v in ib["Close"].resample("W-FRI").last().dropna().items()]
    ifix = ifix_b3()
    bench["ifix"] = ifix or anterior.get("ifix", [])
    gravar(SAIDA / "_benchmarks.json", bench)
    print(f"retorno total: {n} ativos; CDI {len(bench['cdi'])} meses; IPCA {len(bench['ipca'])} meses")


if __name__ == "__main__":
    main()
