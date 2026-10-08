from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor


WORKSPACE_OUTPUT = Path("docs/Hub_Bugs_Melhorias_MVP_V0_revisado.docx")
DOWNLOADS_OUTPUT = Path(r"C:\Users\incit\Downloads\Hub_Bugs_Melhorias_MVP_V0_revisado.docx")


PROBLEMS = [
    {
        "id": "HUB-001",
        "title": "O cliente Polar H10 nao tem reconexao automatica documentada no codigo",
        "category": "Critico para teste",
        "priority": "P1",
        "impact": "Se o WebSocket do driver Polar ou do Hub cair, a captura pode parar no meio da experiencia.",
        "action": "Adicionar tentativas automaticas de reconexao com intervalo progressivo (retry/backoff). Como alternativa, criar um passo a passo operacional para reiniciar o servico e registrar essa lacuna no log.",
    },
    {
        "id": "HUB-002",
        "title": "O ECG bruto do Polar precisa continuar separado do HRV no contrato da nova versao",
        "category": "Ajuste importante",
        "priority": "P1",
        "impact": "Se o ECG ficar dentro de hrv.raw, o relatorio pode nao exportar o sinal bruto de forma clara.",
        "action": "Levar o ecg.raw da bridge antiga para a versao nova ou criar uma exportacao dedicada para o ECG.",
    },
    {
        "id": "HUB-003",
        "title": "O hrv.raw ainda esta aberto demais para testes com dados reais",
        "category": "Ajuste importante",
        "priority": "P1",
        "impact": "Dados incompletos podem ser aceitos mesmo sem informacoes como bpm, rrMs, sequence, device ou qualidade.",
        "action": "Definir quais campos sao obrigatorios e validar isso no adapter e no doctor.",
    },
    {
        "id": "HUB-004",
        "title": "O dashboard salva apenas uma parte da telemetria HRV no localStorage",
        "category": "Ajuste importante",
        "priority": "P1",
        "impact": "O relatorio local perde dados brutos, como os arrays ibiMs e ecg.",
        "action": "Anexar o JSONL bruto. Para a V1, criar uma exportacao completa por run.",
    },
    {
        "id": "HUB-005",
        "title": "O limite local de 5000 eventos pode cortar um run longo ou um ECG de alta frequencia",
        "category": "Ajuste importante",
        "priority": "P1",
        "impact": "A UI ou o relatorio pode descartar amostras antigas antes do export local.",
        "action": "Avisar quando o limite estiver perto e oferecer uma exportacao baseada no JSONL do Hub.",
    },
    {
        "id": "HUB-006",
        "title": "O sessionId do Hub e o runId analitico ainda podem ficar diferentes",
        "category": "Ajuste importante",
        "priority": "P2",
        "impact": "Isso dificulta encontrar os dados corretos depois do teste.",
        "action": "Registrar o runId em todos os exports e criar um indice: sessionId -> runIds -> arquivos.",
    },
    {
        "id": "HUB-007",
        "title": "Os logs JSONL nao tem indice ou visualizador local por sessao",
        "category": "Melhoria futura",
        "priority": "P2",
        "impact": "A leitura manual fica lenta para comparar runs, filtrar topicos e anexar evidencias.",
        "action": "Criar uma CLI biofeedback-session inspect/export.",
    },
    {
        "id": "HUB-008",
        "title": "O suporte a multiplos sensores existe, mas ainda falta um modelo de qualidade por sensor",
        "category": "Melhoria futura",
        "priority": "P2",
        "impact": "A V1/V2 precisara comparar sinais considerando qualidade, gaps e unidades padronizadas.",
        "action": "Criar um modelo comum de sample/quality e cards por sensor.",
    },
    {
        "id": "HUB-009",
        "title": "O export cientifico ainda nao tem um formato final versionado",
        "category": "Melhoria futura",
        "priority": "P2",
        "impact": "Pesquisadores podem precisar importar dados sem adaptar manualmente cada export.",
        "action": "Definir um pacote com manifest, events.jsonl, biometrics, markers, commands e metadados.",
    },
    {
        "id": "HUB-010",
        "title": "Falta historico persistente multi-run no dashboard",
        "category": "Melhoria futura",
        "priority": "P3",
        "impact": "A plataforma futura precisara consultar runs anteriores.",
        "action": "Evoluir para armazenamento local indexado ou para um backend persistente na V1/V2.",
    },
]


MVP_ITEMS = [
    "Confirmar que a versao nova do Hub usa a bridge Polar H10 corrigida, com hrv.raw, ecg.raw e timestamps derivados do pacote do driver quando disponiveis.",
    "Rodar ou anexar evidencia de um run ponta a ponta com Polar H10 real, Unreal/oculos, dashboard e logs JSONL no mesmo contexto de teste.",
    "Garantir que a captura nao dependa apenas da memoria/localStorage do dashboard: o JSONL bruto do Hub deve ser preservado como fonte primaria.",
    "Exportar o pacote minimo do V0: JSONL bruto, report JSON, CSV de markers, CSV/JSON de biometria e, quando houver, arquivo/export de ECG bruto.",
    "Registrar a relacao entre sessionId do Hub, runId da experiencia, arquivos exportados e evidencia visual ou textual do /status.",
    "Executar um preflight antes do teste: Hub online, dashboard conectado, Polar H10 streaming, Unreal inscrito/publicando lifecycle e ausencia de pendencias criticas.",
]


FUTURE_IMPROVEMENTS = [
    {
        "phase": "V1",
        "title": "Export completo por run",
        "related": "HUB-002, HUB-004, HUB-005, HUB-006, HUB-009",
        "description": "Transformar o export em um pacote unico por run, incluindo manifest, eventos, biometria, ECG bruto, markers, comandos, sessionId e runId.",
    },
    {
        "phase": "V1",
        "title": "Inspector local de sessoes",
        "related": "HUB-006, HUB-007",
        "description": "Criar uma CLI ou tela local para listar sessoes, filtrar topicos, resumir runs, detectar gaps e apontar quais arquivos pertencem a cada teste.",
    },
    {
        "phase": "V1",
        "title": "Contrato minimo de sensor real",
        "related": "HUB-003, HUB-008",
        "description": "Definir campos obrigatorios e recomendados para sensores reais, incluindo qualidade, sequence, device, source, sampleAgeMs, unidade e taxa de amostragem.",
    },
    {
        "phase": "V2",
        "title": "Modelo de qualidade multi-sensor",
        "related": "HUB-008",
        "description": "Padronizar qualidade de sinal, gaps, stale samples, unidades e confianca para comparar HRV, ECG, IMU, temperatura, ar e sensores futuros.",
    },
    {
        "phase": "V2",
        "title": "Historico multi-run no dashboard",
        "related": "HUB-010",
        "description": "Permitir consulta de runs anteriores, comparacao entre sessoes e recuperacao de exports sem depender apenas do estado local do navegador.",
    },
    {
        "phase": "V3",
        "title": "Formato cientifico versionado",
        "related": "HUB-009",
        "description": "Consolidar um formato estavel para pesquisa, com schema versionado, metadados de experimento, participantes, sensores, eventos e arquivos brutos.",
    },
]


def configure_styles(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.10

    for style_name, size, color, before, after in [
        ("Heading 1", 16, "2E74B5", 16, 8),
        ("Heading 2", 13, "2E74B5", 12, 6),
        ("Heading 3", 12, "1F4D78", 8, 4),
    ]:
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)

    for style_name in ("List Bullet", "List Number"):
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style.font.size = Pt(11)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.167


def add_title(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = paragraph.add_run(text)
    run.font.name = "Calibri"
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string("0B2545")


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    paragraph = doc.add_paragraph(style=f"Heading {level}")
    paragraph.add_run(text)


def add_bullet(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.add_run(text)


def add_problem(doc: Document, item: dict[str, str]) -> None:
    add_heading(doc, f"{item['id']} - {item['title']}", 2)
    add_bullet(doc, f"Categoria: {item['category']}.")
    add_bullet(doc, f"Prioridade: {item['priority']}.")
    add_bullet(doc, f"Impacto: {item['impact']}")
    add_bullet(doc, f"Acao recomendada: {item['action']}")


def add_future_improvement(doc: Document, item: dict[str, str]) -> None:
    add_heading(doc, f"{item['phase']} - {item['title']}", 2)
    add_bullet(doc, f"Relacionado aos problemas: {item['related']}.")
    add_bullet(doc, item["description"])


def build_doc(output: Path) -> None:
    doc = Document()
    configure_styles(doc)

    add_title(doc, "Bugs criticos e melhorias do Hub")
    subtitle = doc.add_paragraph()
    subtitle.add_run("Mapeamento revisado para MVP/V0 e roadmap futuro.").italic = True

    meta = doc.add_paragraph()
    meta.add_run("Data do mapeamento: ").bold = True
    meta.add_run("2026-06-16")

    add_heading(doc, "Resumo executivo", 1)
    doc.add_paragraph(
        "Esta versao separa os itens que sustentam a coleta do MVP/V0 dos ajustes e melhorias futuras. "
        "A lista de problemas foi mantida em topicos, sem tabela, com IDs de HUB-001 a HUB-010."
    )

    add_heading(doc, "Itens MVP/V0 que precisam estar cobertos", 1)
    for item in MVP_ITEMS:
        add_bullet(doc, item)

    add_heading(doc, "Ordem sugerida de execucao", 1)
    for item in [
        "Antes do proximo teste: HUB-001, HUB-002, HUB-003.",
        "Ainda no ciclo V0: HUB-004, HUB-005, HUB-006.",
        "V1/V2/V3: HUB-007, HUB-008, HUB-009, HUB-010.",
    ]:
        add_bullet(doc, item)

    add_heading(doc, "Problemas mapeados", 1)
    for problem in PROBLEMS:
        add_problem(doc, problem)

    add_heading(doc, "Melhorias futuras revisadas", 1)
    doc.add_paragraph(
        "As melhorias futuras abaixo foram reorganizadas a partir dos problemas selecionados. "
        "Elas nao substituem os ajustes de V0; elas transformam os aprendizados do teste em produto e pipeline de pesquisa."
    )
    for improvement in FUTURE_IMPROVEMENTS:
        add_future_improvement(doc, improvement)

    add_heading(doc, "Pacote minimo de evidencia para aceitar V0", 1)
    for item in [
        "JSONL bruto da sessao do Hub.",
        "Print ou saida de /status mostrando Unreal conectado e sensor conectado.",
        "Pelo menos um experience.lifecycle started e um experience.lifecycle ended.",
        "Pelo menos dois experience.marker vindos do XR ou de comando aceito pelo Bridge.",
        "Amostras hrv.raw durante a janela da experiencia.",
        "ECG bruto preservado em ecg.raw, arquivo dedicado ou pacote de export.",
        "Export JSON do report, CSV de markers e CSV/JSON de biometria.",
        "Nota curta com versoes: Hub, plugin, projeto Unreal, dispositivo/sensor, driver Polar e endpoint usado.",
    ]:
        add_bullet(doc, item)

    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def main() -> None:
    build_doc(WORKSPACE_OUTPUT)
    build_doc(DOWNLOADS_OUTPUT)


if __name__ == "__main__":
    main()
