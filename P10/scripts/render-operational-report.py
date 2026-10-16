"""Render the six-field P10 operation report to a reviewable two-page PDF."""

from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.parse import urljoin

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "informe-operacion.md"
OUTPUT = ROOT / "docs" / "informe-operacion.pdf"
PUBLIC_DOCS = "https://github.com/yaniadavid/Practicas-SA-B-202010175-P10/blob/main/P10/docs/"


def rich_text(value: str) -> str:
    value = html.escape(value)

    def link(match: re.Match[str]) -> str:
        label, target = match.groups()
        href = target if target.startswith("https://") else urljoin(PUBLIC_DOCS, target)
        return f'<link href="{html.escape(href, quote=True)}" color="#19618a"><u>{label}</u></link>'

    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"`([^`]+)`", r'<font color="#184e73">\1</font>', value)
    return value


def decorate(canvas, document):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor("#d8e2e8"))
    canvas.line(43, height - 42, width - 43, height - 42)
    canvas.setFont("Arial", 8)
    canvas.setFillColor(colors.HexColor("#526575"))
    canvas.drawString(43, 28, "P10 · Observabilidad y operación del canary")
    canvas.drawRightString(width - 43, 28, f"Página {document.page}")
    canvas.restoreState()


def main():
    pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))
    pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold")
    title = ParagraphStyle("title", fontName="Arial-Bold", fontSize=18, leading=22,
                           textColor=colors.HexColor("#153c55"), spaceAfter=8)
    subtitle = ParagraphStyle("subtitle", fontName="Arial", fontSize=9, leading=12,
                              textColor=colors.HexColor("#526575"), spaceAfter=16)
    heading = ParagraphStyle("heading", fontName="Arial-Bold", fontSize=10.5, leading=13,
                             textColor=colors.HexColor("#145e7d"), spaceBefore=12, spaceAfter=5)
    body = ParagraphStyle("body", fontName="Arial", fontSize=9.1, leading=13.2,
                          textColor=colors.HexColor("#243744"), alignment=TA_LEFT, spaceAfter=4)
    note = ParagraphStyle("note", parent=body, fontSize=8.3, leading=11.6,
                          textColor=colors.HexColor("#526575"), spaceBefore=10)

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = []
    paragraph = []

    def flush():
        if paragraph:
            content = " ".join(paragraph)
            story.append(Paragraph(rich_text(content), note if content.startswith("**Evidencia:") else body))
            paragraph.clear()

    for line in lines:
        line = line.strip()
        if not line:
            flush()
        elif line.startswith("# "):
            flush()
            story.append(Paragraph(rich_text(line[2:]), title))
        elif line.startswith("## "):
            flush()
            story.append(Paragraph(rich_text(line[3:]), heading))
        else:
            paragraph.append(line)
    flush()
    story.append(Spacer(1, 4))
    document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=43, rightMargin=43,
                                 topMargin=55, bottomMargin=47, title="P10 - Informe de operación",
                                 author="Yania Dávid")
    document.build(story, onFirstPage=decorate, onLaterPages=decorate)
    print(OUTPUT)


if __name__ == "__main__":
    main()
