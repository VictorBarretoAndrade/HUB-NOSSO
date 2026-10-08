from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor


SOURCE = Path(r"C:\Users\incit\Downloads\Hub_Bugs_Melhorias_MVP_V0.docx")
WORKSPACE_OUTPUT = Path("docs/Hub_Bugs_Melhorias_MVP_V0_topicos.docx")
DOWNLOADS_OUTPUT = Path(r"C:\Users\incit\Downloads\Hub_Bugs_Melhorias_MVP_V0_topicos.docx")


EXECUTION_ORDER = [
    "Cliente Polar H10 nao tem reconexao automatica documentada no codigo",
    "ECG bruto do Polar precisa continuar separado de HRV no contrato da versao nova",
    "hrv.raw ainda e schema aberto demais para teste com dado real",
    "Dashboard salva apenas subconjunto da telemetria HRV no localStorage",
    "Limite local de 5000 eventos pode truncar run longo ou ECG de alta frequencia",
    "sessionId do hub e runId analitico ainda podem divergir",
    "Logs JSONL nao tem indice/visualizador local por sessao",
    "Suporte a multiplos sensores existe, mas falta modelo de qualidade por sensor",
    "Export cientifico ainda nao tem formato final versionado",
    "Falta historico persistente multi-run no dashboard",
]


@dataclass
class Item:
    old_id: str
    new_id: str
    priority: str
    title: str
    impact: str
    action: str
    category: str


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


def split_id_priority(text: str) -> tuple[str, str]:
    parts = [part.strip() for part in text.splitlines() if part.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    if parts:
        return parts[0], ""
    return "", ""


def extract_items(source: Path) -> list[Item]:
    doc = Document(source)
    categories = ["Critico para teste", "Ajuste importante", "Melhoria futura"]
    extracted: list[Item] = []
    for table_index, table in enumerate(doc.tables):
        category = categories[table_index] if table_index < len(categories) else "Ajuste importante"
        for row in table.rows[1:]:
            old_id, priority = split_id_priority(row.cells[0].text)
            extracted.append(
                Item(
                    old_id=old_id,
                    new_id="",
                    priority=priority,
                    title=row.cells[1].text.strip(),
                    impact=row.cells[2].text.strip(),
                    action=row.cells[3].text.strip(),
                    category=category,
                )
            )

    order_index = {title: index for index, title in enumerate(EXECUTION_ORDER)}
    extracted.sort(key=lambda item: order_index.get(item.title, 999))
    for index, item in enumerate(extracted, start=1):
        item.new_id = f"HUB-{index:03d}"
    return extracted


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


def add_item(doc: Document, item: Item) -> None:
    add_heading(doc, f"{item.new_id} - {item.title}", 2)
    add_bullet(doc, f"Categoria: {item.category}.")
    add_bullet(doc, f"Prioridade: {item.priority}.")
    add_bullet(doc, f"Impacto: {item.impact}")
    add_bullet(doc, f"Acao recomendada: {item.action}")


def execution_lines(items: list[Item]) -> list[str]:
    by_id = {item.new_id: item for item in items}
    return [
        "Antes do proximo teste: HUB-001, HUB-002, HUB-003.",
        "Ainda no ciclo V0: HUB-004, HUB-005, HUB-006.",
        "V1/V2/V3: HUB-007, HUB-008, HUB-009, HUB-010.",
    ]


def build_doc(items: list[Item], output: Path) -> None:
    doc = Document()
    configure_styles(doc)

    add_title(doc, "Bugs criticos e melhorias do Hub")
    subtitle = doc.add_paragraph()
    subtitle.add_run("Mapeamento revisado em formato de topicos para anexar na tarefa.").italic = True

    meta = doc.add_paragraph()
    meta.add_run("Data do mapeamento: ").bold = True
    meta.add_run("2026-06-16")

    add_heading(doc, "Resumo executivo", 1)
    doc.add_paragraph(
        "Esta versao remove as tabelas e organiza cada problema como topico individual. "
        "Os IDs foram renumerados conforme a ordem sugerida de execucao."
    )

    add_heading(doc, "Evidencias consideradas", 1)
    for text in [
        "A pasta antiga C:/Users/incit/Documents/hub-ue-main contem logs com sensor real Polar H10.",
        "session-20260602T131220Z.jsonl: polar-h10=2401, hrv.raw=2400, unreal.state=239, lifecycle=6, markers=3.",
        "session-20260602T140314Z.jsonl: polar-h10=1272, hrv.raw=1271, unreal.state=297, lifecycle=6, markers=7.",
        "A bridge antiga polar_h10_bridge.py ja usa packet.timestamp como collectedAt e estima firstSampleAt/lastSampleAt para ECG.",
    ]:
        add_bullet(doc, text)

    add_heading(doc, "Ordem sugerida de execucao", 1)
    for text in execution_lines(items):
        add_bullet(doc, text)

    add_heading(doc, "Problemas mapeados", 1)
    for item in items:
        add_item(doc, item)

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

    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def main() -> None:
    items = extract_items(SOURCE)
    build_doc(items, WORKSPACE_OUTPUT)
    build_doc(items, DOWNLOADS_OUTPUT)


if __name__ == "__main__":
    main()
