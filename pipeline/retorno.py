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


def serie_semanal_fii(fech: pd.Series, rend: dict, desde: str | None) -> list:
    """FII: cotações semanais (Yahoo + COTAHIST da B3) e rendimentos cruzados de várias fontes (rendimentos_fii.py),
    no lugar do Yahoo, que não tem os rendimentos antes de 2022 nem as cotações antigas de vários fundos.
    O fechamento ajustado é refeito reinvestindo cada rendimento na cota na data ex. A série começa em `desde`
    (primeiro pregão, ou o mês a partir do qual os rendimentos são conhecidos, se for depois)."""
    if desde:
        fech = fech[fech.index >= pd.Timestamp(desde)]
    prov = pd.Series(0.0, index=fech.index)
    for data, v in rend.items():
        i = fech.index.searchsorted(pd.Timestamp(data) + pd.Timedelta(days=1))   # semana da data ex (dia útil seguinte à data base)
        if 0 < i < len(fech.index):
            prov.iloc[i] += v
    out, aj, c_ant = [], None, None
    for (data, c), p in zip(fech.items(), prov.values):
        aj = float(c) if aj is None else aj * (float(c) + p) / c_ant
        c_ant = float(c)
        out.append([data.strftime("%Y-%m-%d"), round(float(c), 4), aj, round(float(p), 6)])
    if out:
        k = out[-1][1] / out[-1][2]          # mesma convenção do Yahoo: o ajustado termina igual ao fechamento
        for r in out:
            r[2] = round(r[2] * k, 4)
    return out


def _sexta_ex(data_com: str) -> str:
    """Sexta-feira da semana da data ex (dia útil seguinte à data com)."""
    d = dt.date.fromisoformat(data_com) + dt.timedelta(days=1)
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return (d + dt.timedelta(days=(4 - d.weekday()) % 7)).isoformat()


def _perto(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.05 * max(abs(a), abs(b)), 0.005)


def corrigir_proventos_acao(t: str, semanal: list, b3: list) -> tuple[list, list]:
    """Confere os proventos do Yahoo com os da B3 (oficiais, últimos 12 meses) semana a semana; quando divergem,
    o Investidor10 desempata. Pagamento que falta no Yahoo entra pelo registro da B3. Devolve a série corrigida
    (ajustado refeito reinvestindo os proventos) e a lista de correções."""
    import i10
    hoje = dt.date.today().isoformat()
    b3 = [p for p in b3 or [] if p.get("data_com") and p.get("valor") and _sexta_ex(p["data_com"]) <= hoje]
    if not b3 or not semanal:
        return semanal, []
    ini = min(_sexta_ex(p["data_com"]) for p in b3)
    pb, mes_de = {}, {}
    for p in b3:
        k = _sexta_ex(p["data_com"])
        pb[k] = pb.get(k, 0.0) + p["valor"]
        mes_de[k] = p["data_com"][:7]
    datas = [r[0] for r in semanal]
    py = {r[0]: r[3] for r in semanal if r[3] and r[0] >= ini}
    terceira = None
    corr, novo = [], {}
    for k in sorted(set(pb) | set(py)):
        b, y = pb.get(k), py.get(k)
        if b is not None and y is not None and _perto(b, y):
            continue
        if b is None:
            continue                      # só no Yahoo: a lista da B3 às vezes não traz tudo; mantém
        if terceira is None:
            try:
                terceira = i10.historico(t, tipo="acoes")
            except Exception:
                terceira = {}
        i = terceira.get(mes_de[k])
        if y is not None and i is not None and _perto(i, y) and not _perto(i, b):
            continue                      # Investidor10 confirma o Yahoo
        novo[k] = b
        corr.append({"semana": k, "yahoo": round(y, 6) if y is not None else None, "b3": round(b, 6),
                     "investidor10": round(i, 6) if i is not None else None, "usado": "B3"})
    if not novo:
        return semanal, []
    out = [list(r) for r in semanal]
    for k, v in novo.items():
        j = next((n for n, d in enumerate(datas) if d >= k), None)
        if j is None:
            continue
        # tira o valor do Yahoo da semana errada mais próxima (até 2 semanas) e põe o da B3 na semana certa
        for n in range(max(0, j - 2), min(len(out), j + 3)):
            if out[n][3] and n != j and out[n][0] not in pb and abs(out[n][3] - v) < max(v, out[n][3]):
                out[n][3] = 0.0
        out[j][3] = round(v, 6)
    aj = None
    for n, r in enumerate(out):
        aj = r[1] if aj is None else aj * (r[1] + r[3]) / out[n - 1][1]
        r[2] = aj
    k = out[-1][1] / out[-1][2]
    for r in out:
        r[2] = round(r[2] * k, 4)
    return out, corr


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
    stocks = {a["ticker"] for a in universo if a.get("tipo") == "STOCK_US"}
    tickers = [a["ticker"] for a in universo] + [f["ticker"] for f in fiis]
    sim = {t: (t if t in stocks else t + ".SA") for t in tickers}   # stocks americanas não levam .SA
    dfs = S.precos_yf(list(sim.values()) + ["^BVSP", "^SP500TR"], anos=ANOS)
    try:
        import rendimentos_fii
        rend_fii = rendimentos_fii.todos(dfs)
    except Exception as e:
        print(f"rendimentos dos FIIs: {e}; FIIs ficam com os dividendos do Yahoo")
        rend_fii = {}
    prov_b3 = {}
    try:      # proventos oficiais da B3 (últimos 12 meses), gravados pelo update.py
        dv = json.loads((RAIZ / "data" / "dividends.json").read_text(encoding="utf-8"))
        prov_b3 = {t: x["lista"] for t, x in dv.items() if isinstance(x, dict) and str(x.get("fonte", "")).startswith("B3")}
    except Exception as e:
        print(f"proventos da B3: {e}")
    n = 0
    for t in tickers:
        df = dfs.get(sim[t])
        if df is None or df.empty:
            if t not in rend_fii:
                print(f"{t}: sem preço")
                continue
        fonte = "Yahoo Finance (bolsa americana, em US$)" if t in stocks else "Yahoo Finance (B3)"
        obj = {"ticker": t, "fonte": fonte, "moeda": "USD" if t in stocks else "BRL",
               "colunas": ["data", "fechamento", "ajustado", "proventos"]}
        if t in rend_fii and rend_fii[t][0]:
            serie, primeiro, info, semanal = rend_fii[t]
            listado = info.get("listado_desde")
            # rendimentos conhecidos só a partir de um mês bem depois da listagem: a série começa ali, com aviso
            limitado = bool(primeiro and listado and primeiro > (pd.Timestamp(listado) + pd.DateOffset(months=2)).strftime("%Y-%m"))
            desde = (primeiro + "-01") if limitado else listado
            obj["semanal"] = serie_semanal_fii(semanal, serie, desde)
            obj["fonte"] = "B3 (COTAHIST) e Yahoo Finance"
            obj["listado_desde"] = listado
            obj["proventos_desde"] = primeiro
            obj["inicio_limitado"] = limitado
            obj["fonte_proventos"] = ", ".join(rendimentos_fii.NOMES[f] for f in rendimentos_fii.PRIORIDADE if info["meses_por_fonte"].get(f))
            obj["conferencia"] = {k: v for k, v in info.items() if k != "exemplos_conflito"}
        else:
            obj["semanal"] = serie_semanal(df)
            if t in prov_b3:
                obj["semanal"], corr = corrigir_proventos_acao(t, obj["semanal"], prov_b3[t])
                if corr:
                    obj["correcoes_proventos"] = corr
                    print(f"{t}: {len(corr)} provento(s) do Yahoo corrigido(s) pela B3")
        gravar(SAIDA / f"{t}.json", obj)
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
    sp = dfs.get("^SP500TR")   # S&P 500 com dividendos reinvestidos (Total Return), em US$: referência das stocks
    if sp is not None and not sp.empty:
        bench["sp500"] = [[d.strftime("%Y-%m-%d"), round(float(v), 2)] for d, v in sp["Close"].resample("W-FRI").last().dropna().items()]
    else:
        bench["sp500"] = anterior.get("sp500", [])
    gravar(SAIDA / "_benchmarks.json", bench)
    print(f"retorno total: {n} ativos; CDI {len(bench['cdi'])} meses; IPCA {len(bench['ipca'])} meses")


if __name__ == "__main__":
    main()
