"""
PDF pipeline: convert DOCX → PDF, merge PDFs in order, optionally add page numbers.

Copied verbatim from pdf-master2/pdf_pipeline.py.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List

from pypdf import PdfReader, PdfWriter


def convert_docx_to_pdf(docx_path: Path, output_dir: Path | None = None) -> Path:
    """
    Convert a single .docx file to PDF.

    macOS/Linux: prefers LibreOffice, falls back to docx2pdf.
    Windows: prefers docx2pdf (Word automation), falls back to LibreOffice.
    """
    docx_path = Path(docx_path).resolve()
    if not docx_path.suffix.lower() == '.docx':
        raise ValueError(f'Not a .docx file: {docx_path}')
    if not docx_path.exists():
        raise FileNotFoundError(docx_path)

    out_dir = Path(output_dir) if output_dir else docx_path.parent
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / f'{docx_path.stem}.pdf'

    def _try_docx2pdf() -> bool:
        try:
            from docx2pdf import convert as docx2pdf_convert
            docx2pdf_convert(str(docx_path), str(pdf_path))
            return pdf_path.exists()
        except Exception:
            return False

    def _try_soffice() -> bool:
        soffice = shutil.which('soffice') or shutil.which('libreoffice')
        if not soffice and Path('/Applications/LibreOffice.app').exists():
            soffice = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
        if not soffice or not Path(soffice).exists():
            return False
        try:
            subprocess.run(
                [soffice, '--headless', '--convert-to', 'pdf', '--outdir', str(out_dir), str(docx_path)],
                check=True,
                capture_output=True,
                timeout=300,
            )
        except subprocess.CalledProcessError:
            return False
        return pdf_path.exists()

    ok = False
    if sys.platform == 'win32':
        ok = _try_docx2pdf() or _try_soffice()
    else:
        ok = _try_soffice() or _try_docx2pdf()

    if ok:
        return pdf_path

    raise RuntimeError(
        'To convert Word (.docx) files, install one of:\n'
        '  • LibreOffice: brew install --cask libreoffice\n'
        '  • docx2pdf: pip install docx2pdf (uses Word on Windows/Mac)\n'
        'Merging PDF-only files does not require either.'
    )


def merge_pdfs(pdf_paths: List[Path], output_path: Path) -> None:
    """Merge PDFs in the given order into a single file."""
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = PdfWriter()
    for p in pdf_paths:
        p = Path(p).resolve()
        if not p.exists():
            raise FileNotFoundError(p)
        reader = PdfReader(str(p))
        for page in reader.pages:
            writer.add_page(page)
    with open(output_path, 'wb') as f:
        writer.write(f)


def add_numbered_header(input_path: Path, output_path: Path) -> None:
    """Add 'Pag. n/total' to each page (header)."""
    from add_page_numbers import add_numbers_to_pdf
    add_numbers_to_pdf(Path(input_path), Path(output_path))


def build_merged_pdf(
    file_paths: List[Path],
    output_path: Path,
    enumerate: bool = False,
    temp_dir: Path | None = None,
) -> Path:
    """
    Main pipeline: convert any .docx to PDF, merge all in order, optionally add page numbers.

    file_paths : List of paths to .pdf or .docx files (order preserved).
    output_path: Where to write the final PDF.
    enumerate  : If True, run add_numbered_header on the merged document.
    temp_dir   : Optional directory for intermediate files.
    """
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    use_temp = temp_dir is None
    if use_temp:
        temp_dir = Path(tempfile.mkdtemp())
    else:
        temp_dir = Path(temp_dir).resolve()
        temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        pdf_paths: List[Path] = []
        for p in file_paths:
            p = Path(p).resolve()
            if not p.exists():
                raise FileNotFoundError(p)
            if p.suffix.lower() == '.docx':
                pdf_paths.append(convert_docx_to_pdf(p, output_dir=temp_dir))
            elif p.suffix.lower() == '.pdf':
                pdf_paths.append(p)
            else:
                raise ValueError(f'Unsupported format: {p} (use .pdf or .docx)')

        if not pdf_paths:
            raise ValueError('No PDF or DOCX files to merge.')

        merged_path = temp_dir / 'merged.pdf'
        merge_pdfs(pdf_paths, merged_path)

        if enumerate:
            add_numbered_header(merged_path, output_path)
        else:
            shutil.copy2(merged_path, output_path)

        return output_path
    finally:
        if use_temp and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
