from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUT = Path("docs/Hub_Bugs_Melhorias_MVP_V0.docx")


ITEMS = [
    {
        "id": "HUB-001",
        "title": "Evidencia de Polar H10 real existe na pasta antiga, mas precisa entrar na versao nova",
        "category": "Critico para teste",
        "priority": "P0",
        "area": "Sensores, captura, exportacao",
        "impact": "Se a versao nova nao portar a bridge validada, o proximo teste pode perder ECG/HRV real ou rastreabilidade.",
        "action": "Portar/confirmar a bridge Polar H10 antiga e anexar os logs historicos como evidencia.",
    },
    {
        "id": "HUB-002",
        "title": "ACK duplicado ou prematuro no Unreal pode mascarar comando nao executado",
        "category": "Critico para teste",
        "priority": "P0",
        "area": "Unreal, comandos, sincronizacao",
        "impact": "O dashboard pode considerar comandos aceitos antes da confirmacao real do Bridge/Blueprint.",
        "action": "Configurar Auto Ack Commands=false e eliminar ACK automatico quando o Bridge for responsavel.",
    },
    {
        "id": "HUB-003",
        "title": "Correcoes de timestamp do Polar precisam ser portadas/confirmadas nesta versao",
        "category": "Critico para teste",
        "priority": "P0",
        "area": "Sensores, sessao, sincronizacao",
        "impact": "A bridge antiga usa packet.timestamp como collectedAt; o cliente novo ainda pode voltar ao tempo de chegada do adapter.",
        "action": "Portar timestamp_to_iso, firstSampleAt, lastSampleAt e sampleTimestampMode da bridge antiga.",
    },
    {
        "id": "HUB-004",
        "title": "Export do run completo ainda precisa ser comprovado com sensor + Unreal reais",
        "category": "Critico para teste",
        "priority": "P0",
        "area": "Exportacao, leitura minima",
        "impact": "A equipe pode terminar o teste sem artefato analisavel fora do dashboard.",
        "action": "Gerar report JSON, report CSV, marker snapshots, biometria e JSONL bruto no fim do teste.",
    },
    {
        "id": "HUB-013",
        "title": "Falta runbook curto de coleta V0 com evidencias obrigatorias",
        "category": "Critico para teste",
        "priority": "P0",
        "area": "Operacao, logs, exportacao",
        "impact": "Mesmo com codigo funcionando, a equipe pode nao capturar as evidencias necessarias.",
        "action": "Criar checklist de setup, preflight, inicio, durante, fim, exports e criterios de sucesso.",
    },
    {
        "id": "HUB-005",
        "title": "Cliente Polar H10 nao tem reconexao automatica documentada no codigo",
        "category": "Critico para teste",
        "priority": "P1",
        "area": "Sensores, captura",
        "impact": "Queda do WebSocket do driver Polar ou do hub pode encerrar a captura durante a experiencia.",
        "action": "Adicionar retry/backoff ou runbook operacional para relancar e marcar lacuna no log.",
    },
    {
        "id": "HUB-006",
        "title": "ECG bruto do Polar precisa continuar separado de HRV no contrato da versao nova",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Sensores, exportacao",
        "impact": "Se ECG ficar embutido em hrv.raw, o report pode nao exportar o sinal bruto de forma clara.",
        "action": "Portar ecg.raw da bridge antiga ou criar export dedicado para ECG.",
    },
    {
        "id": "HUB-007",
        "title": "Hub nao expira ACK pendente por timeout proprio",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Hub, comandos, diagnostico",
        "impact": "Pendencias antigas podem ficar em /status e confundir diagnostico.",
        "action": "Adicionar TTL de ACK no hub e expor estado pending/timeout em /status.",
    },
    {
        "id": "HUB-008",
        "title": "Dashboard salva apenas subconjunto da telemetria HRV no localStorage",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Dashboard, logs, exportacao",
        "impact": "O report local perde arrays brutos como ibiMs e ecg.",
        "action": "Para V0, anexar JSONL bruto; para V1, criar export completo por run.",
    },
    {
        "id": "HUB-009",
        "title": "Limite local de 5000 eventos pode truncar run longo ou ECG de alta frequencia",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Dashboard, captura, exportacao",
        "impact": "A UI/report pode descartar amostras antigas antes do export local.",
        "action": "Alertar quando o limite estiver perto e oferecer export baseado no JSONL do hub.",
    },
    {
        "id": "HUB-010",
        "title": "hrv.raw ainda e schema aberto demais para teste com dado real",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Sensores, leitura minima",
        "impact": "Payloads incompletos podem passar sem bpm, rrMs, sequence, device ou qualidade.",
        "action": "Definir contrato minimo V0 e validar no adapter e no doctor.",
    },
    {
        "id": "HUB-011",
        "title": "biofeedback-doctor precisa virar preflight de teste real",
        "category": "Ajuste importante",
        "priority": "P1",
        "area": "Diagnostico, sensores, Unreal",
        "impact": "Problemas de sensor, subscribe ou token podem aparecer so depois da experiencia.",
        "action": "Checar hub, Unreal inscrito, sensor recente, lifecycle observado e pending ACKs.",
    },
    {
        "id": "HUB-012",
        "title": "sessionId do hub e runId analitico ainda podem divergir",
        "category": "Ajuste importante",
        "priority": "P2",
        "area": "Sessao, logs, exportacao",
        "impact": "Dificulta encontrar os dados certos depois do teste.",
        "action": "Registrar runId em todos os exports e criar indice sessionId -> runIds -> arquivos.",
    },
    {
        "id": "HUB-018",
        "title": "Faltam testes automatizados cobrindo Polar H10 e fluxo completo de export",
        "category": "Ajuste importante",
        "priority": "P2",
        "area": "Testes, sensores, exportacao",
        "impact": "Regressoes podem passar sem simular o run inteiro.",
        "action": "Adicionar teste com pacotes Polar simulados, lifecycle, markers e report.",
    },
    {
        "id": "HUB-014",
        "title": "Logs JSONL nao tem indice/visualizador local por sessao",
        "category": "Melhoria futura",
        "priority": "P2",
        "area": "Logs, leitura",
        "impact": "A leitura manual fica lenta para comparar runs, filtrar topicos e anexar evidencia.",
        "action": "Criar CLI biofeedback-session inspect/export.",
    },
    {
        "id": "HUB-015",
        "title": "Suporte a multiplos sensores existe, mas falta modelo de qualidade por sensor",
        "category": "Melhoria futura",
        "priority": "P2",
        "area": "Sensores, analytics",
        "impact": "V1/V2 precisara comparar sinais com qualidade, gaps e unidade padronizada.",
        "action": "Criar modelo comum de sample/quality e cards por sensor.",
    },
    {
        "id": "HUB-016",
        "title": "Export cientifico ainda nao tem formato final versionado",
        "category": "Melhoria futura",
        "priority": "P2",
        "area": "Exportacao, pesquisa",
        "impact": "Pesquisadores precisarao importar dados sem adaptar manualmente cada export.",
        "action": "Definir pacote com manifest, events.jsonl, biometrics, markers, commands e metadados.",
    },
    {
        "id": "HUB-017",
        "title": "Falta historico persistente multi-run no dashboard",
        "category": "Melhoria futura",
        "priority": "P3",
        "area": "Dashboard, produto",
        "impact": "A plataforma futura precisara consultar runs anteriores.",
        "action": "Evoluir para armazenamento local indexado ou backend persistente em V1/V2.",
    },
]


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_text(cell, text: str, bold: bool = False, color: str | None = None) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.size = Pt(8.5)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def set_table_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), "D9E2EC")


def set_cell_width(cell, width_dxa: int) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(width_dxa))
    tc_w.set(qn("w:type"), "dxa")


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    paragraph = doc.add_paragraph(style=f"Heading {level}")
    paragraph.add_run(text)


def add_bullet(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.add_run(text)


def add_item_table(doc: Document, items: list[dict[str, str]]) -> None:
    table = doc.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    widths = [900, 2700, 2500, 3260]
    headers = ["ID / Prior.", "Titulo", "Impacto", "Acao recomendada"]
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        set_cell_width(cell, widths[index])
        set_cell_shading(cell, "E8EEF5")
        set_cell_text(cell, header, bold=True, color="1F4D78")

    for item in items:
        row = table.add_row()
        values = [
            f"{item['id']}\n{item['priority']}",
            item["title"],
            item["impact"],
            item["action"],
        ]
        for index, value in enumerate(values):
            cell = row.cells[index]
            set_cell_width(cell, widths[index])
            set_cell_text(cell, value)

    doc.add_paragraph()


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


def build_doc() -> None:
    doc = Document()
    configure_styles(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = title.add_run("Bugs criticos e melhorias do Hub")
    run.font.name = "Calibri"
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string("0B2545")

    subtitle = doc.add_paragraph()
    subtitle.add_run("Mapeamento para decisao de MVP/V0 antes do proximo teste com sensores, Unreal e exportacao.").italic = True

    meta = doc.add_paragraph()
    meta.add_run("Data do mapeamento: ").bold = True
    meta.add_run("2026-06-16")

    add_heading(doc, "Resumo executivo", 1)
    doc.add_paragraph(
        "O objetivo deste documento e separar falhas que podem ameaçar a coleta do MVP/V0 de ajustes e melhorias que podem ficar para ciclos futuros. "
        "Foi considerado critico tudo que pode impedir conexao, captura, sincronizacao, exportacao ou leitura minima dos dados."
    )

    add_heading(doc, "Evidencias revisadas", 1)
    for text in [
        "A pasta antiga C:/Users/incit/Documents/hub-ue-main contem logs com sensor real Polar H10.",
        "session-20260602T131220Z.jsonl: polar-h10=2401, hrv.raw=2400, unreal.state=239, lifecycle=6, markers=3.",
        "session-20260602T140314Z.jsonl: polar-h10=1272, hrv.raw=1271, unreal.state=297, lifecycle=6, markers=7.",
        "A bridge antiga polar_h10_bridge.py ja usa packet.timestamp como collectedAt e estima firstSampleAt/lastSampleAt para ECG.",
        "Conclusao: o risco atual e portar/confirmar essa correcao na versao nova, nao tratar o sensor real como nunca testado.",
    ]:
        add_bullet(doc, text)

    add_heading(doc, "Corrigir ou validar antes do proximo teste", 1)
    for text in [
        "Confirmar bAutoAckCommands=False no projeto Unreal usado no teste e eliminar ACK duplicado/misleading.",
        "Confirmar que a versao nova usa a bridge Polar H10 corrigida da pasta antiga.",
        "Anexar a evidencia historica de Polar H10 real e, se possivel, repetir um run curto com a versao nova.",
        "Exportar o mesmo run completo: report JSON, CSV de markers e CSV/JSON de biometria.",
        "Usar checklist preflight com hub online, Unreal inscrito em unreal.commands, sensor streaming e dashboard recebendo eventos.",
    ]:
        add_bullet(doc, text)

    add_heading(doc, "Critico para teste", 1)
    add_item_table(doc, [item for item in ITEMS if item["category"] == "Critico para teste"])

    add_heading(doc, "Ajuste importante", 1)
    add_item_table(doc, [item for item in ITEMS if item["category"] == "Ajuste importante"])

    add_heading(doc, "Melhoria futura", 1)
    add_item_table(doc, [item for item in ITEMS if item["category"] == "Melhoria futura"])

    add_heading(doc, "Pacote minimo de evidencia para aceitar V0", 1)
    for text in [
        "JSONL bruto da sessao do hub.",
        "Print ou saida de /status mostrando Unreal conectado e sensor conectado.",
        "Pelo menos um experience.lifecycle started e um experience.lifecycle ended.",
        "Pelo menos dois experience.marker vindos do XR ou de comando aceito pelo Bridge.",
        "Amostras hrv.raw durante a janela da experiencia.",
        "Export JSON do report, CSV de markers e CSV/JSON de biometria.",
        "Nota curta com versoes: hub, plugin, projeto Unreal, dispositivo/sensor e endpoint usado.",
    ]:
        add_bullet(doc, text)

    add_heading(doc, "Ordem sugerida de correcao", 1)
    for text in [
        "Antes do proximo teste: HUB-001, HUB-002, HUB-003, HUB-004, HUB-013.",
        "Ainda no ciclo V0: HUB-005, HUB-006, HUB-007, HUB-008, HUB-009, HUB-010, HUB-011.",
        "V1/V2/V3: HUB-014, HUB-015, HUB-016, HUB-017, com HUB-018 entrando conforme o adapter real estabilizar.",
    ]:
        add_bullet(doc, text)

    doc.save(OUT)


if __name__ == "__main__":
    build_doc()
