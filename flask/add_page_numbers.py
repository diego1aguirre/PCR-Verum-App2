"""
Add page counter "Pag. {current}/{total}" to every page of a PDF.

Copied verbatim from pdf-master2/add_page_numbers.py.
"""

import io
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

# ---------- HEADER: page number location & size ----------
FONT_SIZE = 18
HEADER_TOP_PT = 35          # 0.25 in from top of page to baseline
HEADER_RIGHT_MARGIN_PT = 20  # distance from right edge
# ---------------------------------------------------------


def _get_font_name() -> str:
    if sys.platform == 'darwin':
        arial_paths = [
            Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
            Path('/Library/Fonts/Arial.ttf'),
        ]
        for path in arial_paths:
            if path.exists():
                try:
                    from reportlab.pdfbase import pdfmetrics
                    from reportlab.pdfbase.ttfonts import TTFont
                    pdfmetrics.registerFont(TTFont('Arial', str(path)))
                    return 'Arial'
                except Exception:
                    break
    return 'Helvetica'


FONT_NAME = _get_font_name()


def create_page_number_overlay(width_pt: float, height_pt: float, current: int, total: int) -> bytes:
    """Create a single-page PDF overlay with 'Pag. current/total' in the header (top-right)."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width_pt, height_pt))

    baseline_y = height_pt - HEADER_TOP_PT
    x_right = width_pt - HEADER_RIGHT_MARGIN_PT

    text = f'Pag. {current}/{total}'
    c.setFont(FONT_NAME, FONT_SIZE)
    c.drawRightString(x_right, baseline_y, text)

    c.save()
    buffer.seek(0)
    return buffer.read()


def add_numbers_to_pdf(input_path: Path, output_path: Path) -> None:
    """Add 'Pag. n/total' to each page and save to output_path."""
    reader = PdfReader(input_path)
    total_pages = len(reader.pages)
    writer = PdfWriter()

    for page_num in range(total_pages):
        page = reader.pages[page_num]
        mediabox = page.mediabox
        width_pt = float(mediabox.width)
        height_pt = float(mediabox.height)

        overlay_pdf_bytes = create_page_number_overlay(
            width_pt, height_pt, page_num + 1, total_pages
        )
        overlay_reader = PdfReader(io.BytesIO(overlay_pdf_bytes))
        overlay_page = overlay_reader.pages[0]

        page.merge_page(overlay_page)
        writer.add_page(page)

    with open(output_path, 'wb') as f:
        writer.write(f)
