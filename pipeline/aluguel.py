"""Aba "Aluguel de ações": ranking diário do aluguel (BTC) de todos os papéis da B3 e série por ativo.

Fonte: Boletim Diário da B3 (arquivos.b3.com.br/bdi), tabelas
  BTBLendingOpenPosition   posição em aberto (ações alugadas e R$), linha "Total" de cada papel
  BTBLoanBalance           contratos do dia e taxas (tomador e doador, em fração ao ano); sem contrato no dia,
                           a B3 repete a última taxa ("taxa herdada")
  ConsolidatedTradesEquities  fechamento e quantidade negociada no dia (dias para zerar a posição)
  InstrumentsEquities      categoria do papel e quantidade de ações da classe (MktCptlstn)
O boletim só guarda os últimos 21 dias: o robô diário acumula a série em data/aluguel/serie/<T>.json.
Grava data/aluguel/dia/<AAAA-MM-DD>.json (ranking do dia, todos os papéis) e data/aluguel/indice.json.
Uso: python pipeline/aluguel.py [--dias 21]
"""
import datetime as dt
import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
PASTA = RAIZ / "data" / "aluguel"
GUARDAR_DIAS = 60            # arquivos de ranking diário mantidos
MIN_SERIE = 1_000_000        # só guarda série de quem já teve pelo menos R$ 1 mi alugado
CATEG = {"SHARES": "Ação", "UNITS": "Unit", "FUNDS": "FII", "ETF EQUITIES": "ETF", "BDR": "BDR"}


def tabela(nome: str, data: str) -> tuple[list, list]:
    corpo = {"Name": nome, "Date": data, "FinalDate": data, "ClientId": "", "Filters": {}}
    for tentativa in range(3):
        try:
            r = requests.post(f"{S.B3_BDI}/table/export", json=corpo, timeout=300, headers={"Accept": "application/json"})
            r.raise_for_status()
            j = r.json()
            return [c["name"] for c in j.get("columns", [])], j.get("values", [])
        except Exception as e:
            ult = e
    raise ult


def linhas(nome: str, data: str) -> list[dict]:
    cols, vals = tabela(nome, data)
    return [dict(zip(cols, v)) for v in vals]


def cadastro(data: str) -> dict:
    """{ticker: {categoria, acoes da classe, empresa}} do cadastro de instrumentos (mercado à vista)."""
    out = {}
    for r in linhas("InstrumentsEquities", data):
        if r.get("SgmtNm") != "CASH" or r.get("MktNm") != "EQUITY-CASH":
            continue
        cat = CATEG.get(str(r.get("SctyCtgyNm") or "").upper())
        if not cat:
            continue
        out[r["TckrSymb"]] = {"cat": cat, "acoes": r.get("MktCptlstn"), "empresa": r.get("CrpnNm"), "emissor": r.get("Asst")}
    return out


def dia(data: str, cad: dict, volumes: dict) -> list[dict]:
    pos = {r["TckrSymb"]: r for r in linhas("BTBLendingOpenPosition", data) if str(r.get("Market")).strip().lower() == "total"}
    taxas = {}
    for r in linhas("BTBLoanBalance", data):
        t = taxas.setdefault(r["TckrSymb"], {"tkr": r.get("TkrAvrgRate"), "dnr": r.get("DnrAvrgRate"), "contratos": 0, "valor_dia": 0.0, "empresa": r.get("Company")})
        t["contratos"] += r.get("QtyCtrctsDay") or 0
        t["valor_dia"] += r.get("BRLValue") or 0
    neg = {r["TckrSymb"]: r for r in linhas("ConsolidatedTradesEquities", data) if r.get("SgmtNm") == "CASH"}
    for tk, r in neg.items():
        if r.get("FinInstrmQty"):
            volumes.setdefault(tk, []).append(float(r["FinInstrmQty"]))
    # valor de mercado da empresa: soma das classes de ação (ON, PN...) a fechamento
    vm_emp = {}
    for tk, c in cad.items():
        if c["cat"] == "Ação" and c.get("acoes") and tk in neg and neg[tk].get("LastPric"):
            vm_emp[c["emissor"]] = vm_emp.get(c["emissor"], 0.0) + c["acoes"] * neg[tk]["LastPric"]
    out = []
    for tk, p in pos.items():
        c = cad.get(tk, {})
        tx = taxas.get(tk, {})
        qtd, valor = p.get("StockBalance") or 0, p.get("Balance") or 0
        if not qtd:
            continue
        vols = volumes.get(tk) or []
        vol_med = sum(vols[-21:]) / len(vols[-21:]) if vols else None
        vm = vm_emp.get(c.get("emissor")) if c.get("cat") == "Ação" else None
        out.append({"t": tk, "nome": c.get("empresa") or p.get("Company") or tx.get("empresa"), "tipo": c.get("cat") or "Outro",
                    "classe": p.get("Type"), "qtd": qtd, "valor": round(valor, 2),
                    "taxa": tx.get("tkr"), "taxa_doador": tx.get("dnr"), "herdada": (tx.get("contratos") or 0) == 0,
                    "contratos_dia": tx.get("contratos") or 0,
                    "pct_acoes": qtd / c["acoes"] if c.get("acoes") else None,
                    "vm": round(vm, 0) if vm else None, "pct_vm": valor / vm if vm else None,
                    "dias_zerar": qtd / vol_med if vol_med else None, "preco": (neg.get(tk) or {}).get("LastPric")})
    return out


def arred(x: dict) -> dict:
    """Arredonda para o arquivo ficar leve (o site lê o ranking do dia inteiro)."""
    for k, n in (("taxa", 6), ("taxa_doador", 6), ("pct_acoes", 6), ("pct_vm", 6), ("dias_zerar", 2), ("d_pct", 6), ("d_valor", 4)):
        if isinstance(x.get(k), float):
            x[k] = round(x[k], n)
    return {k: v for k, v in x.items() if v is not None and v is not False}


def main():
    dias = int(sys.argv[sys.argv.index("--dias") + 1]) if "--dias" in sys.argv else 21
    (PASTA / "dia").mkdir(parents=True, exist_ok=True)
    (PASTA / "serie").mkdir(parents=True, exist_ok=True)
    ultimo = S.b3_ultimo_pregao()
    datas, d = [], dt.date.fromisoformat(ultimo)
    while len(datas) < dias:
        if d.weekday() < 5:
            datas.append(d.isoformat())
        d -= dt.timedelta(days=1)
    datas.sort()
    feitos = {p.stem for p in (PASTA / "dia").glob("*.json")}
    cad = cadastro(ultimo)
    volumes, novos = {}, []
    for data in datas:
        try:
            r = dia(data, cad, volumes)        # roda todos para acumular o volume médio, mesmo os já gravados
        except Exception as e:
            print(f"{data}: {e}")
            continue
        if not r:
            continue                           # feriado: boletim sem posições
        if data not in feitos:
            novos.append(data)
        anterior = sorted(x for x in feitos | set(novos) if x < data)
        prev = {}
        if anterior:
            pa = PASTA / "dia" / f"{anterior[-1]}.json"
            if pa.exists():
                prev = {x["t"]: x for x in json.loads(pa.read_text(encoding="utf-8"))["linhas"]}
        for x in r:
            p = prev.get(x["t"])
            if p:
                x["d_pct"] = (x["pct_acoes"] - p["pct_acoes"]) if x.get("pct_acoes") is not None and p.get("pct_acoes") is not None else None
                x["d_valor"] = (x["valor"] / p["valor"] - 1) if p.get("valor") else None
        r = [arred(x) for x in r]
        (PASTA / "dia" / f"{data}.json").write_text(json.dumps({"data": data, "linhas": r}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        feitos.add(data)
        # série por ativo
        for x in r:
            arq = PASTA / "serie" / f"{x['t']}.json"
            if not arq.exists() and x["valor"] < MIN_SERIE:
                continue
            s = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {"t": x["t"], "colunas": ["data", "taxa", "qtd", "valor", "pct_acoes", "herdada"], "serie": []}
            s["serie"] = [y for y in s["serie"] if y[0] != data] + [[data, x["taxa"], x["qtd"], x["valor"], x["pct_acoes"], x["herdada"]]]
            s["serie"].sort()
            s["serie"] = s["serie"][-800:]
            arq.write_text(json.dumps(s, separators=(",", ":")), encoding="utf-8")
    todas = sorted(p.stem for p in (PASTA / "dia").glob("*.json"))
    for velha in todas[:-GUARDAR_DIAS]:
        (PASTA / "dia" / f"{velha}.json").unlink()
    todas = todas[-GUARDAR_DIAS:]
    (PASTA / "indice.json").write_text(json.dumps({"atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "datas": todas,
                                                   "fonte": "B3, Boletim Diário (empréstimo de ativos)"}, ensure_ascii=False), encoding="utf-8")
    print(f"aluguel: {len(novos)} dia(s) novo(s); {len(todas)} dias guardados; último {todas[-1] if todas else None}")


if __name__ == "__main__":
    main()
