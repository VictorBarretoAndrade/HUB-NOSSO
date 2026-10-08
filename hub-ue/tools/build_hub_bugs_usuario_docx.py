from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor


WORKSPACE_OUTPUT = Path("docs/Hub_Bugs_Melhorias_MVP_V0_final.docx")
DOWNLOADS_OUTPUT = Path(r"C:\Users\incit\Downloads\Hub_Bugs_Melhorias_MVP_V0_final.docx")


PROBLEMS = [
    {
        "id": "HUB-001",
        "title": "O cliente Polar H10 não tem reconexão automática documentada no código",
        "category": "Crítico para teste.",
        "priority": "P1.",
        "phase": "V0 - precisa ser feito antes ou durante o próximo teste.",
        "impact": "Se o WebSocket do driver Polar ou do Hub cair, a captura pode parar no meio da experiência.",
        "action": "Adicionar tentativas automáticas de reconexão com intervalo progressivo (retry/backoff). Como alternativa, criar um passo a passo operacional para reiniciar o serviço e registrar essa lacuna no log.",
    },
    {
        "id": "HUB-002",
        "title": "O ECG bruto do Polar precisa continuar separado do HRV no contrato da nova versão",
        "category": "Ajuste importante.",
        "priority": "P1.",
        "phase": "V0 - precisa ser feito para manter ECG bruto rastreável na nova versão.",
        "impact": "Se o ECG ficar dentro de hrv.raw, o relatório pode não exportar o sinal bruto de forma clara.",
        "action": "Levar o ecg.raw da bridge antiga para a versão nova ou criar uma exportação dedicada para o ECG.",
    },
    {
        "id": "HUB-003",
        "title": "O hrv.raw ainda está aberto demais para testes com dados reais",
        "category": "Ajuste importante.",
        "priority": "P1.",
        "phase": "V0 - precisa ser feito para evitar entrada de dado real incompleto.",
        "impact": "Dados incompletos podem ser aceitos mesmo sem informações como bpm, rrMs, sequence, device ou qualidade.",
        "action": "Definir quais campos são obrigatórios e validar isso no adapter e no doctor.",
    },
    {
        "id": "HUB-004",
        "title": "O dashboard salva apenas uma parte da telemetria HRV no localStorage",
        "category": "Ajuste importante.",
        "priority": "P1.",
        "phase": "V0 - precisa ser coberto operacionalmente com JSONL bruto; export completo fica para V1.",
        "impact": "O relatório local perde dados brutos, como os arrays ibiMs e ecg.",
        "action": "Anexar o JSONL bruto. Para a V1, criar uma exportação completa por run.",
    },
    {
        "id": "HUB-005",
        "title": "O limite local de 5000 eventos pode cortar um run longo ou um ECG de alta frequência",
        "category": "Ajuste importante.",
        "priority": "P1.",
        "phase": "V0 - precisa de alerta ou mitigação para não perder amostras em teste longo.",
        "impact": "A UI ou o relatório pode descartar amostras antigas antes do export local.",
        "action": "Avisar quando o limite estiver perto e oferecer uma exportação baseada no JSONL do Hub.",
    },
    {
        "id": "HUB-006",
        "title": "O sessionId do Hub e o runId analítico ainda podem ficar diferentes",
        "category": "Ajuste importante.",
        "priority": "P2.",
        "phase": "V0 - precisa pelo menos registrar a relação sessionId/runId nos exports; índice completo pode evoluir depois.",
        "impact": "Isso dificulta encontrar os dados corretos depois do teste.",
        "action": "Registrar o runId em todos os exports e criar um índice: sessionId -> runIds -> arquivos.",
    },
    {
        "id": "HUB-007",
        "title": "Os logs JSONL não têm índice ou visualizador local por sessão",
        "category": "Melhoria futura.",
        "priority": "P2.",
        "phase": "V1 - melhoria futura, depois do V0 estar rastreável por JSONL e exports.",
        "impact": "A leitura manual fica lenta para comparar runs, filtrar tópicos e anexar evidências.",
        "action": "Criar uma CLI biofeedback-session inspect/export.",
    },
    {
        "id": "HUB-008",
        "title": "O suporte a múltiplos sensores existe, mas ainda falta um modelo de qualidade por sensor",
        "category": "Melhoria futura.",
        "priority": "P2.",
        "phase": "V1/V2 - melhoria futura para consolidar análise multi-sensor.",
        "impact": "A V1/V2 precisará comparar sinais considerando qualidade, gaps e unidades padronizadas.",
        "action": "Criar um modelo comum de sample/quality e cards por sensor.",
    },
    {
        "id": "HUB-009",
        "title": "O export científico ainda não tem um formato final versionado",
        "category": "Melhoria futura.",
        "priority": "P2.",
        "phase": "V1 - melhoria futura para padronizar entrega científica depois do V0.",
        "impact": "Pesquisadores podem precisar importar dados sem adaptar manualmente cada export.",
        "action": "Definir um pacote com manifest, events.jsonl, biometrics, markers, commands e metadados.",
    },
    {
        "id": "HUB-010",
        "title": "Falta histórico persistente multi-run no dashboard",
        "category": "Melhoria futura.",
        "priority": "P3.",
        "phase": "V1/V2 - melhoria futura de produto/plataforma.",
        "impact": "A plataforma futura precisará consultar runs anteriores.",
        "action": "Evoluir para armazenamento local indexado ou para um backend persistente na V1/V2.",
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
    ]:
        style = doc.styles[style_name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.font.bold = True
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)

    bullet = doc.styles["List Bullet"]
    bullet.font.name = "Calibri"
    bullet.font.size = Pt(11)
    bullet.paragraph_format.space_after = Pt(4)


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


def add_bullet(doc: Document, label: str, value: str) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    run = paragraph.add_run(f"{label}: ")
    run.bold = True
    paragraph.add_run(value)


def build_doc(output: Path) -> None:
    doc = Document()
    configure_styles(doc)

    add_title(doc, "Problemas mapeados")
    subtitle = doc.add_paragraph()
    subtitle.add_run("Lista revisada conforme seleção enviada pelo usuário.").italic = True

    for item in PROBLEMS:
        add_heading(doc, f"{item['id']} - {item['title']}", 2)
        add_bullet(doc, "Categoria", item["category"])
        add_bullet(doc, "Prioridade", item["priority"])
        add_bullet(doc, "Momento de execução", item["phase"])
        add_bullet(doc, "Impacto", item["impact"])
        add_bullet(doc, "Ação recomendada", item["action"])

    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def main() -> None:
    build_doc(WORKSPACE_OUTPUT)
    build_doc(DOWNLOADS_OUTPUT)


if __name__ == "__main__":
    main()
