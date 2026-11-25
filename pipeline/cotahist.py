"""Série histórica oficial de cotações da B3 (arquivos COTAHIST anuais, desde 1986), para os papéis cujo histórico
no Yahoo começa tarde (vários FIIs só têm preço no Yahoo a partir de 2014 ou 2024).
Lê só o mercado à vista (TPMERC 010) e grava, por ticker, o fechamento diário SEM ajuste e o ISIN."""
import datetime as dt
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

CACHE = Path(__file__).resolve().parent / ".cache" / "cotahist"
URL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{}.ZIP"


def arquivo(ano: int) -> Path | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"COTAHIST_A{ano}.ZIP"
    atual = ano >= dt.date.today().year
    import time
    if not p.exists() or p.stat().st_size < 1000 or (atual and time.time() - p.stat().st_mtime > 86400):
        try:
            p.write_bytes(S.get(URL.format(ano), headers={"User-Agent": "Mozilla/5.0"}).content)
        except Exception as e:
            print(f"COTAHIST {ano}: {e}")
            return p if p.exists() else None
    return p


def series(tickers: set[str], desde: int = 2009) -> dict:
    """{ticker: [[AAAA-MM-DD, fechamento, isin], ...]} sem ajuste de desdobramento."""
    out = {t: [] for t in tickers}
    for ano in range(desde, dt.date.today().year + 1):
        p = arquivo(ano)
        if not p:
            continue
        try:
            z = zipfile.ZipFile(p)
        except zipfile.BadZipFile:
            p.unlink(missing_ok=True)
            continue
        with z.open(z.namelist()[0]) as f:
            for linha in io.TextIOWrapper(f, encoding="latin1"):
                if not linha.startswith("01"):
                    continue
                cod = linha[12:24].strip()
                if cod in out and linha[24:27] == "010":
                    d = f"{linha[2:6]}-{linha[6:8]}-{linha[8:10]}"
                    fech = int(linha[108:121]) / 100
                    fator = int(linha[210:217]) or 1          # FATCOT: cotação por lote (1 ou 1000)
                    out[cod].append([d, fech / fator, linha[230:242]])
    for t in out:
        out[t].sort()
    return out


def desdobramentos(serie: list, limite: float = 1.8) -> list[dict]:
    """Saltos de preço de um pregão para o seguinte compatíveis com desdobramento (preço cai a 1/N) ou grupamento."""
    ev = []
    for (d0, p0, _), (d1, p1, _) in zip(serie, serie[1:]):
        if p0 <= 0 or p1 <= 0:
            continue
        r = p0 / p1
        for n in (2, 3, 4, 5, 8, 10, 15, 20, 100):
            if abs(r / n - 1) < 0.12:
                ev.append({"data_com": d0, "fator": float(n), "evento": "Desdobramento", "fonte": "COTAHIST B3 (salto de preço)"})
                break
            if abs(r * n - 1) < 0.12:
                ev.append({"data_com": d0, "fator": 1 / n, "evento": "Grupamento", "fonte": "COTAHIST B3 (salto de preço)"})
                break
    return ev


if __name__ == "__main__":
    s = series(set(sys.argv[1:]))
    for t, v in s.items():
        print(t, len(v), v[:1], v[-1:], desdobramentos(v))
