# Análise Fundamentalista B3

Site estático de análise fundamentalista de ações brasileiras e BDRs. Um pipeline em Python busca os dados em fontes primárias, calcula os indicadores e grava arquivos JSON em `data/`. O site (`index.html` + `assets/`) só lê esses JSON e nunca chama API externa pelo navegador.

Fase atual: **Fase 2 (137 ativos)**.

## Como rodar

Dois cliques em `rodar_local.bat`. Ele:

1. cria o ambiente virtual `.venv` na primeira vez e instala as dependências;
2. roda o pipeline (1 a 3 minutos);
3. abre `http://localhost:8000` com um servidor local.

O site precisa ser aberto pelo servidor local. Abrir o `index.html` direto (file://) não funciona, porque o navegador bloqueia a leitura dos JSON.

Para rodar só o pipeline, num terminal na pasta do projeto:

```
.venv\Scripts\python pipeline\update.py
.venv\Scripts\python pipeline\update.py --sem-noticias
```

Testes das fórmulas:

```
cd pipeline
..\.venv\Scripts\python -m pytest -q
```

Conferência contra o balanço oficial (gera `relatorios/conferencia_fase1.md`):

```
.venv\Scripts\python pipeline\conferencia.py
```

## Estrutura

```
index.html                 site (HTML)
assets/app.js              lógica do site; CONFIG no topo (pesos do score, regras, senha)
assets/style.css           visual (tema claro e escuro)
data/universe.json         lista de ativos e classificação (fonte da verdade, editável)
data/config.json           parâmetros do pipeline (faixas de porte, g por setor, Bazin, prêmios de risco)
data/notes.json            resumo do negócio, riscos, oportunidades, campos manuais (editável)
data/prices.json           preço de fechamento e variações (gerado)
data/fundamentals.json     indicadores LTM, médias de 5 anos, medianas e percentis do setor (gerado)
data/dividends.json        proventos com separação dividendo/JCP (gerado)
data/macro.json            Selic, CDI, IPCA, NTN-B longa, PTAX, Treasury 10y, Ibovespa, S&P 500 (gerado)
data/history/<TICKER>.json histórico anual de 10 anos e preços, carregado só na página do ativo (gerado)
data/news/<TICKER>.json    notícias e comunicados oficiais (gerado)
data/indicators_meta.json  nome, fórmula e direção de cada indicador (gerado de indicators.py)
pipeline/update.py         orquestra busca, cálculo e gravação
pipeline/indicators.py     todas as fórmulas (funções puras) + testes em test_indicators.py
pipeline/cvm.py            leitura de DFP/ITR da CVM e montagem do LTM
pipeline/sec.py            fundamentos de BDRs pelo SEC EDGAR
pipeline/sources.py        acesso às fontes (CVM, B3, yfinance, brapi, BCB, Tesouro, FRED, SEC, Google News)
pipeline/conferencia.py    conferência independente contra o balanço oficial
pipeline/.cache/           cache pequeno e filtrado (fora do git)
relatorios/                cobertura de dados e conferência
.github/workflows/daily.yml  atualização diária (Fase 2)
```

## Adicionar um ativo

Acrescente um objeto em `data/universe.json` e rode o pipeline. Nada de código muda.

Ação brasileira:

```json
{
  "ticker": "PETR4", "nome": "Petrobras", "tipo": "ACAO_BR",
  "setor_macro": "Petróleo e gás", "setor_micro": "Integrada",
  "ticker_exterior": null, "bolsa_exterior": null, "proporcao_bdr": null,
  "moeda_reporte": "BRL", "modelo_analise": "GERAL",
  "segmento_listagem": "N2", "tag_along": 100,
  "emissor_b3": "PETR", "classes": {"ON": "PETR3", "PN": "PETR4"}, "acoes_por_papel": 1,
  "sensibilidade": {"selic_caindo": 0, "dolar_subindo": 2, "commodities_subindo": 2, "pib_acelerando": 0, "inflacao_subindo": 0, "risco_fiscal_subindo": -1}
}
```

- `emissor_b3`: as 4 letras do emissor. O pipeline busca na B3 o código CVM e o resto.
- `classes`: opcional. Se faltar, o pipeline lê os tickers de ON e PN no Formulário Cadastral (FCA) da CVM. O valor de mercado soma ON e PN, cada uma pelo seu preço.
- Units: opcional. A composição (ex.: "1 ON + 2 PN") também vem do FCA; só preencha `composicao_unit` e `acoes_por_papel` se o pipeline avisar que não encontrou.
- `segmento_listagem` e `tag_along`: opcionais. O segmento vem da B3; o tag along sai da regra do segmento (Novo Mercado e Nível 2: 100%; ON fora deles: 80% por lei). PN fora do NM/N2 depende do estatuto: preencha à mão.
- `modelo_analise`: GERAL, BANCO, SEGURADORA, HOLDING, TESOURARIA_CRIPTO ou DISTRESSED.
- HOLDING: acrescente `"participacoes_listadas": ["GGBR4"]`. O percentual detido vem do Formulário de Referência e o desconto é calculado contra o valor de mercado das investidas.
- TESOURARIA_CRIPTO: a quantidade de BTC vem da SEC (XBRL) ou do saldo de criptoativos no balanço da CVM. Se não houver, preencha `manuais.btc_em_caixa` no notes.json.

BDR: `tipo` BDR_EXTERIOR ou BDR_EXPOSICAO_BR, preencha `ticker_exterior`, `bolsa_exterior`, `proporcao_bdr`, `proporcao_fonte` (de onde veio a proporção) e `moeda_reporte` (USD, ou BRL para empresas como XP e Inter que reportam em reais). Não invente a proporção: o pipeline confere a proporção pelo preço e registra um aviso se a diferença passar de 10%.

Se o setor micro for novo, acrescente o crescimento real dele em `data/config.json` (`g_real_por_setor_micro`); sem isso vale `g_real_padrao`.

## Editar notas

Em `data/notes.json`, por ticker:

- `resumo`: 3 a 5 linhas sobre o negócio;
- `tese`, `riscos`, `oportunidades`: aparecem em "Minhas notas" na página do ativo;
- `qualitativo`: campos livres (concessões de elétricas, VSO e banco de terrenos de construtoras);
- `manuais`: indicadores que só existem em release, em fração (0.15 = 15%). Bancos: `basileia`, `inadimplencia_90`, `cobertura_pdd`. Seguradoras: `indice_combinado`, `sinistralidade`. Coloque a origem em `fonte`.

Depois de editar, rode o pipeline para os campos manuais entrarem no cálculo.

## Trocar pesos do score e regras

No topo de `assets/app.js`, objeto `CONFIG`:

- `PESOS`: Valuation e TIR, Qualidade, Solidez, Crescimento e Proventos (somam 1);
- `OPORTUNIDADES` e `RISCOS`: limites das regras automáticas;
- `COLUNAS_PADRAO`: colunas da tabela da home;
- `MODO_PRIVADO` e `SENHA_SHA256`: senha simples (padrão `trocar-senha`). É uma trava de site estático, não protege dado sigiloso.

Basta salvar e recarregar a página. Não precisa rodar o pipeline.

## Fontes

| Dado | Fonte |
|---|---|
| Demonstrações BR (10 anos + LTM) | CVM Dados Abertos: DFP e ITR, consolidado |
| Número de ações e tesouraria | CVM (composição do capital no ITR/DFP); B3 só para escala |
| Controlador e free float | CVM, Formulário de Referência (posição acionária) |
| Segmento de listagem | B3 e CVM (FCA), conferidos contra o universe.json |
| Proventos BR | B3 (dividendo e JCP separados, cerca de 12 meses); anos anteriores pelo yfinance |
| Preços | yfinance (`TICKER.SA`); brapi.dev quando há `BRAPI_TOKEN` |
| Fundamentos de BDR | SEC EDGAR companyfacts; yfinance quando a SEC não tem trimestrais em XBRL |
| Selic, CDI, IPCA, PTAX | Banco Central (SGS); inflação de longo prazo pelo Focus |
| NTN-B longa | Tesouro Direto (Tesouro IPCA+ de maior vencimento) |
| Treasury 10y | FRED (DGS10) |
| Notícias | Google News RSS |
| Comunicados | CVM IPE (fatos relevantes, comunicados, resultados) e SEC EDGAR submissions |

## Aviso

Conteúdo de caráter educacional e informativo. Não constitui recomendação de compra ou venda de valores mobiliários nem relatório de análise nos termos da Resolução CVM 20. Rentabilidade passada não garante rentabilidade futura.
