"""Rendimento mensal por cota dos FIIs lido dos documentos oficiais de "Rentabilidade" que os administradores
publicam no FundosNet (B3). Os mais antigos (2016) trazem a tabela mês a mês desde o início do fundo ou de alguns anos
antes, e cobrem o período anterior aos avisos estruturados (2017) e ao informe mensal da CVM.

Cada administrador usa um leiaute; a leitura é genérica por linha: número de cotas (inteiro), patrimônio líquido
(o maior valor), valor patrimonial da cota (PL / cotas) e, do que sobra, o montante distribuído (dividido pelas cotas)
ou o rendimento por cota. Valores na base de cotas da época (rendimentos_fii.py ajusta desdobramentos).
"""
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fiis  # noqa: E402
import sources as S  # noqa: E402

CACHE = Path(__file__).resolve().parents[1] / "data" / "fontes" / "rentabilidade"   # guardado no repositório (histórico não muda)
MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}
NUM = re.compile(r"(?<![\d%])-?\d{1,3}(?:\.\d{3})*(?:,\d+)?(?![\d%])|(?<![\d%])-?\d+(?:,\d+)?(?![\d%,.])")


def _num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def _ref(linha: str) -> tuple[str | None, str]:
    m = re.match(r"\s*([a-zç]{3})[/\-\s.]*(\d{2,4})\b(.*)", linha, re.I)
    if m and m.group(1).lower() in MESES:
        a = int(m.group(2))
        a = a + 2000 if a < 100 else a
        return f"{a}-{MESES[m.group(1).lower()]:02d}", m.group(3)
    m = re.match(r"\s*\d{2}/(\d{2})/(\d{4})\b(.*)", linha)
    if m:
        return f"{m.group(2)}-{m.group(1)}", m.group(3)
    return None, linha


def ler_linha(resto: str) -> float | None:
    """Rendimento por cota de uma linha da tabela (None se a linha não tiver distribuição)."""
    resto = re.sub(r"-?\d+(?:,\d+)?\s*%", " ", resto)        # tira percentuais
    toks = NUM.findall(resto)
    vals = [(t, _num(t)) for t in toks]
    if len(vals) < 3:
        return None
    pl = max(v for _, v in vals)
    inteiros = [v for t, v in vals if "," not in t and v >= 100 and v != pl]
    if not inteiros:
        return None
    cotas = max(inteiros)
    vp = pl / cotas
    resto_v = [v for t, v in vals if v not in (pl, cotas) and abs(v / vp - 1) > 0.02 and v > 0]
    grandes = [v for v in resto_v if v > cotas * 0.02]          # montante distribuído (R$)
    pequenos = [v for v in resto_v if v <= cotas * 0.02 and v < vp * 0.2]   # rendimento por cota (R$/cota)
    if grandes:
        por_cota = grandes[0] / cotas
        if pequenos:                                           # a tabela traz os dois: confere
            perto = min(pequenos, key=lambda p: abs(p / por_cota - 1))
            if abs(perto / por_cota - 1) < 0.03:
                return perto
        return por_cota
    if pequenos:
        return pequenos[0]
    if any(v == 0 for _, v in vals):      # linha com distribuição zerada (fundo ainda sem rendimento)
        return 0.0
    return None


def extrair(pdf_bytes: bytes) -> dict:
    try:
        import pypdf
    except ImportError:
        print("pypdf não instalado; documentos de rentabilidade ignorados")
        return {}
    try:
        r = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        texto = "\n".join((p.extract_text() or "") for p in r.pages)
    except Exception:
        return {}
    out = {}
    for linha in texto.splitlines():
        ref, resto = _ref(linha)
        if not ref:
            continue
        v = ler_linha(resto)
        if v is not None:
            out[ref] = round(v, 6)
    return out


def historico(ticker: str, cnpj: str, n_docs: int = 3) -> dict:
    """{AAAA-MM: rendimento por cota na base da época} pelos documentos de Rentabilidade mais antigos."""
    CACHE.mkdir(parents=True, exist_ok=True)
    arq = CACHE / f"{ticker}.json"
    if arq.exists():
        return json.loads(arq.read_text(encoding="utf-8"))
    docs = fiis.fnet_documentos(fiis.so_digitos(cnpj), maximo=3000)
    rent = sorted([d for d in docs if "Rentab" in (d.get("tipoDocumento") or "") + (d.get("categoriaDocumento") or "")], key=lambda d: d["id"])
    votos = {}
    for d in rent[:n_docs]:
        try:
            b = S.get(f"{fiis.FNET}/downloadDocumento?id={d['id']}", headers={"User-Agent": "Mozilla/5.0"}).content
        except Exception as e:
            print(f"{ticker}: documento {d['id']}: {e}")
            continue
        for ref, v in extrair(b).items():
            votos.setdefault(ref, []).append(v)
    out = {}
    for ref, vs in votos.items():
        # vale o valor da maioria dos documentos (o administrador às vezes corrige a tabela nos meses seguintes)
        grupos = []
        for v in vs:
            g = next((g for g in grupos if abs(g[0] - v) <= 0.01 * max(g[0], v, 0.01)), None)
            g.append(v) if g else grupos.append([v])
        grupos.sort(key=len, reverse=True)
        if len(grupos) > 1:
            print(f"{ticker} {ref}: documentos divergem {vs}; usado {grupos[0][0]}")
        out[ref] = grupos[0][0]
    out = dict(sorted(out.items()))
    arq.write_text(json.dumps(out), encoding="utf-8")
    return out


if __name__ == "__main__":
    for t in sys.argv[1:]:
        d = json.loads((Path(__file__).resolve().parents[1] / "data" / "fiis" / f"{t}.json").read_text(encoding="utf-8"))
        h = historico(t, d["cnpj"])
        print(t, len(h), list(h.items())[:4], list(h.items())[-2:])
