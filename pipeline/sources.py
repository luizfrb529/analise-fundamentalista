"""
Busca de dados nas fontes primárias. Cada função devolve dados crus (sem cálculo de indicador).

Cache: pipeline/.cache (fora do git). Só guarda as linhas já filtradas para as empresas
do universo, então fica pequeno mesmo com o OneDrive sincronizando a pasta.
Os .zip da CVM são baixados para a memória e descartados.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
import json
import os
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
import requests

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / ".cache"
CACHE.mkdir(exist_ok=True)

UA = "analise-fundamentalista/1.0 (pipeline de dados publicos; contato: admin@example.com)"
S = requests.Session()
S.headers.update({"User-Agent": UA})


def get(url: str, tentativas: int = 3, timeout: int = 60, **kw) -> requests.Response:
    ult = None
    for i in range(tentativas):
        try:
            r = S.get(url, timeout=timeout, **kw)
            if r.status_code == 200:
                return r
            ult = RuntimeError(f"HTTP {r.status_code} em {url}")
            if r.status_code in (403, 404):
                break
        except requests.RequestException as e:
            ult = e
        time.sleep(1.5 * (i + 1))
    raise ult


def cache_json(nome: str, ttl_horas: float, fn):
    p = CACHE / nome
    if p.exists() and (time.time() - p.stat().st_mtime) < ttl_horas * 3600:
        return json.loads(p.read_text(encoding="utf-8"))
    dados = fn()
    p.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    return dados


# ------------------------------------------------------------------ B3
def b3_emissor(codigo: str) -> dict:
    """Dados cadastrais e proventos do emissor na B3 (ações por classe, segmento, código CVM, proventos)."""
    def f():
        p = base64.b64encode(json.dumps({"issuingCompany": codigo, "language": "pt-br"}).encode()).decode()
        j = get("https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/" + p).json()
        return j[0] if j else {}
    return cache_json(f"b3_{codigo}.json", 20, f)


def num_br(s) -> float | None:
    if s in (None, ""):
        return None
    try:
        return float(str(s).replace(".", "").replace(",", "."))
    except ValueError:
        return None


# ------------------------------------------------------------------ CVM
CVM_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC"


def _ler_zip_filtrado(url: str, codigos: set[str], cnpjs: set[str]) -> dict[str, pd.DataFrame]:
    z = zipfile.ZipFile(io.BytesIO(get(url, timeout=300).content))
    out = {}
    for n in z.namelist():
        if not n.endswith(".csv"):
            continue
        df = pd.read_csv(z.open(n), sep=";", encoding="latin1", dtype=str, on_bad_lines="skip")
        if "CD_CVM" in df.columns:
            df = df[df["CD_CVM"].str.lstrip("0").isin(codigos)]
        elif "CNPJ_CIA" in df.columns:
            df = df[df["CNPJ_CIA"].isin(cnpjs)]
        elif "CNPJ_Companhia" in df.columns:
            df = df[df["CNPJ_Companhia"].isin(cnpjs)]
        else:
            continue
        chave = re.sub(r"_\d{4}\.csv$", "", n)
        out[chave] = df
    return out


def cvm_cadastro() -> dict[str, dict]:
    """Cadastro de companhias abertas: {cd_cvm (sem zeros à esquerda): {cnpj, nome, setor, situacao}}."""
    def f():
        df = pd.read_csv(io.BytesIO(get("https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv").content),
                         sep=";", encoding="latin1", dtype=str)
        out = {}
        for _, r in df.iterrows():
            cd = str(r.get("CD_CVM") or "").lstrip("0")
            if cd and (r.get("SIT") == "ATIVO" or cd not in out):
                out[cd] = {"cnpj": r.get("CNPJ_CIA"), "nome": r.get("DENOM_SOCIAL"), "setor": r.get("SETOR_ATIV"), "situacao": r.get("SIT")}
        return out
    return cache_json("cvm_cadastro.json", 24 * 7, f)


def cvm_arquivo(doc: str, ano: int, codigos: set[str], cnpjs: set[str], ttl_dias: float) -> dict[str, pd.DataFrame]:
    """
    doc: DFP, ITR, IPE, FRE, FCA. Devolve {nome_tabela: DataFrame} só com as empresas pedidas.
    Recarrega se o cache for velho ou não tiver todas as empresas.
    """
    pasta = CACHE / f"cvm_{doc}_{ano}"
    meta = pasta / "_meta.json"
    if meta.exists():
        m = json.loads(meta.read_text())
        fresco = (time.time() - m["ts"]) < ttl_dias * 86400
        if fresco and codigos <= set(m["codigos"]) and cnpjs <= set(m["cnpjs"]):
            return {p.stem: pd.read_csv(p, dtype=str) for p in pasta.glob("*.csv")}
    url = f"{CVM_BASE}/{doc}/DADOS/{doc.lower()}_cia_aberta_{ano}.zip"
    try:
        dados = _ler_zip_filtrado(url, codigos, cnpjs)
    except Exception as e:  # ano ainda não publicado, por exemplo
        print(f"  [cvm] {doc} {ano}: {e}")
        return {}
    pasta.mkdir(exist_ok=True)
    for p in pasta.glob("*.csv"):
        p.unlink()
    for k, df in dados.items():
        df.to_csv(pasta / f"{k}.csv", index=False)
    meta.write_text(json.dumps({"ts": time.time(), "codigos": sorted(codigos), "cnpjs": sorted(cnpjs)}))
    return dados


# ------------------------------------------------------------------ preços
def precos_yf(tickers: list[str], anos: int = 11) -> dict[str, pd.DataFrame]:
    """Histórico diário (Close não ajustado por proventos, mas ajustado por desdobramento; Adj Close; Volume)."""
    """Inclui as colunas Dividends e Stock Splits (actions=True), para não precisar de uma chamada por ticker."""
    import yfinance as yf
    out = {}
    for i in range(0, len(tickers), 60):   # lotes, para o Yahoo não recusar
        lote = tickers[i:i + 60]
        df = yf.download(lote, period=f"{anos}y", auto_adjust=False, actions=True, progress=False, group_by="ticker", threads=True)
        for t in lote:
            try:
                d = df[t] if isinstance(df.columns, pd.MultiIndex) else df
                d = d.dropna(subset=["Close"])
            except KeyError:
                continue
            if len(d):
                cols = [c for c in ("Close", "Adj Close", "Volume", "Dividends", "Stock Splits") if c in d.columns]
                out[t] = d[cols].copy()
        time.sleep(1)
    return out


def acoes_de(df: pd.DataFrame, coluna: str) -> pd.Series:
    """Série de proventos ou desdobramentos (só datas com valor) a partir do download em lote."""
    if df is None or coluna not in df.columns:
        return pd.Series(dtype=float)
    s = df[coluna]
    return s[s.fillna(0) != 0]


def acoes_yf(ticker: str):
    import yfinance as yf
    return yf.Ticker(ticker)


def brapi_quote(tickers: list[str]) -> dict:
    """Cotação via brapi.dev quando há token (variável de ambiente BRAPI_TOKEN)."""
    tok = os.environ.get("BRAPI_TOKEN")
    if not tok:
        return {}
    out = {}
    for i in range(0, len(tickers), 10):
        lote = ",".join(tickers[i:i + 10])
        try:
            j = get(f"https://brapi.dev/api/quote/{lote}?token={tok}").json()
            for q in j.get("results", []):
                out[q["symbol"]] = q
        except Exception as e:
            print("  [brapi]", e)
    return out


# ------------------------------------------------------------------ macro
def bcb_sgs(serie: int, ultimos: int = 1) -> list[dict]:
    # a API do BCB às vezes responde 304 sem corpo; pedir sem cache resolve
    return get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/{ultimos}?formato=json",
               headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}).json()


def bcb_sgs_periodo(serie: int, anos: int = 11) -> list[dict]:
    """Série diária por intervalo de datas (a API limita 'últimos N' e janelas de 10 anos)."""
    hoje = dt.date.today()
    out, fim = [], hoje
    inicio_total = hoje.replace(year=hoje.year - anos)
    while fim > inicio_total:
        ini = max(inicio_total, fim.replace(year=fim.year - 9))
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json"
               f"&dataInicial={ini:%d/%m/%Y}&dataFinal={fim:%d/%m/%Y}")
        out = get(url, headers={"Cache-Control": "no-cache"}).json() + out
        fim = ini - dt.timedelta(days=1)
    return out


def focus_ipca_longo() -> float | None:
    """Mediana Focus do IPCA para o ano mais distante disponível (proxy de inflação de longo prazo)."""
    ano = dt.date.today().year + 3
    url = ("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
           f"?$top=1&$format=json&$orderby=Data%20desc&$filter=Indicador%20eq%20'IPCA'%20and%20DataReferencia%20eq%20'{ano}'"
           "%20and%20baseCalculo%20eq%200")
    try:
        v = get(url).json()["value"]
        return v[0]["Mediana"] / 100 if v else None
    except Exception as e:
        print("  [focus]", e)
        return None


def tesouro_ntnb_longa() -> dict | None:
    """Maior vencimento de Tesouro IPCA+ (NTN-B Principal) na última data, taxa de compra da manhã."""
    url = ("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
           "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv")
    df = pd.read_csv(io.BytesIO(get(url, timeout=300).content), sep=";", decimal=",", encoding="latin1")
    df["Data Base"] = pd.to_datetime(df["Data Base"], dayfirst=True)
    df["Data Vencimento"] = pd.to_datetime(df["Data Vencimento"], dayfirst=True)
    ult = df[df["Data Base"] == df["Data Base"].max()]
    b = ult[ult["Tipo Titulo"].str.strip() == "Tesouro IPCA+"]
    if b.empty:
        return None
    row = b.sort_values("Data Vencimento").iloc[-1]
    return {"taxa": float(row["Taxa Compra Manha"]) / 100, "vencimento": row["Data Vencimento"].strftime("%Y-%m-%d"),
            "data": row["Data Base"].strftime("%Y-%m-%d")}


def fred_dgs10(serie: str = "DGS10") -> dict | None:
    txt = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={serie}").text
    df = pd.read_csv(io.StringIO(txt))
    df.columns = ["data", "v"]
    df = df[pd.to_numeric(df["v"], errors="coerce").notna()]
    r = df.iloc[-1]
    return {"taxa": float(r["v"]) / 100, "data": str(r["data"])}


# ------------------------------------------------------------------ SEC
def sec_cik(ticker: str) -> int | None:
    j = cache_json("sec_tickers.json", 24 * 7, lambda: get("https://www.sec.gov/files/company_tickers.json").json())
    for v in j.values():
        if v["ticker"].upper() == ticker.upper():
            return int(v["cik_str"])
    return None


def sec_companyfacts(cik: int) -> dict:
    return cache_json(f"sec_facts_{cik}.json", 20, lambda: get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json").json())


def sec_submissions(cik: int) -> dict:
    return cache_json(f"sec_sub_{cik}.json", 6, lambda: get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json())


# ------------------------------------------------------------------ notícias
def google_news(consulta: str, lingua: str = "pt-BR", pais: str = "BR", limite: int = 15) -> list[dict]:
    ceid = f"{pais}:{lingua.split('-')[0]}" if lingua != "pt-BR" else "BR:pt-419"
    url = f"https://news.google.com/rss/search?q={quote_plus(consulta)}&hl={lingua}&gl={pais}&ceid={ceid}"
    time.sleep(0.8)   # cortesia com o servidor: ~150 consultas por execução
    root = ET.fromstring(get(url).content)
    itens = []
    for it in root.iter("item"):
        titulo = (it.findtext("title") or "").strip()
        fonte = it.find("source")
        veiculo = fonte.text.strip() if fonte is not None and fonte.text else ""
        if veiculo and titulo.endswith(" - " + veiculo):
            titulo = titulo[: -len(" - " + veiculo)]
        try:
            data = pd.to_datetime(it.findtext("pubDate"), utc=True).isoformat()
        except Exception:
            data = None
        itens.append({"titulo": titulo, "veiculo": veiculo, "data": data, "link": it.findtext("link")})
    itens.sort(key=lambda x: x["data"] or "", reverse=True)
    return itens[:limite]
