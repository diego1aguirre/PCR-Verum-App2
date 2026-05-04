"""
PCR Verum — Flask service (port 5000)

Routes
------
GET  /flask/health                  — liveness probe
POST /flask/comunicado/process      — reformat .docx press-release
POST /flask/merge/merge             — merge PDF/DOCX files with optional page numbers

System dependency: LibreOffice must be installed for any DOCX→PDF conversion.
  macOS:  brew install --cask libreoffice
  Linux:  apt-get install libreoffice  (or equivalent)
  Set SOFFICE_PATH env var to override the binary location.
"""

import io
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from comunicado_processor import process_comunicado
from pdf_pipeline import build_merged_pdf

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/flask/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]}})

# 50 MB — the higher of the two original limits
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# Temp directories for comunicado uploads/outputs
_UPLOAD_DIR = '/tmp/comunicado_uploads'
_OUTPUT_DIR = '/tmp/comunicado_outputs'
os.makedirs(_UPLOAD_DIR, exist_ok=True)
os.makedirs(_OUTPUT_DIR, exist_ok=True)

# ─── LibreOffice helper (used by comunicado PDF conversion) ──────────────────

_SOFFICE_CANDIDATES = [
    'soffice',
    'libreoffice',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
]


def _find_soffice() -> str:
    override = os.environ.get('SOFFICE_PATH')
    if override:
        return override
    for candidate in _SOFFICE_CANDIDATES:
        path = shutil.which(candidate) or (candidate if os.path.isfile(candidate) else None)
        if path:
            return path
    raise FileNotFoundError(
        'LibreOffice not found. Install it or set the SOFFICE_PATH environment variable.'
    )


_PDF_FILTER = (
    'pdf:writer_pdf_Export:'
    'EmbedStandardFonts=true,'
    'EmbedFonts=true,'
    'ExportBookmarksToPDFDestination=true,'
    'ExportLinksRelativeFsys=false,'
    'IsSkipEmptyPages=false,'
    'SelectPdfVersion=0,'
    'UseTaggedPDF=true,'
    'ExportFormFields=false,'
    'HideViewerToolbar=false,'
    'HideViewerMenubar=false,'
    'AllowDuplicateFieldNames=false'
)


def _convert_docx_to_pdf_soffice(docx_path: str, out_dir: str) -> str:
    """Convert a .docx to PDF via LibreOffice headless. Returns the PDF path."""
    soffice = _find_soffice()

    # Ensure absolute paths — LibreOffice can fail to locate files with relative paths
    docx_path = os.path.abspath(docx_path)
    out_dir = os.path.abspath(out_dir)

    # LibreOffice needs a writable HOME and must not inherit a PYTHONPATH that
    # could conflict with its own bundled Python.
    env = os.environ.copy()
    env['HOME'] = '/tmp'
    env['PYTHONPATH'] = ''

    # Diagnostic logging — visible in Railway logs
    logging.warning(f"[soffice] Input file exists: {os.path.exists(docx_path)}")
    logging.warning(f"[soffice] Input file size: {os.path.getsize(docx_path) if os.path.exists(docx_path) else 'N/A'}")
    logging.warning(f"[soffice] Input file path: {docx_path}")
    logging.warning(f"[soffice] Output dir: {out_dir}")
    logging.warning(f"[soffice] HOME env: {env.get('HOME')}")
    logging.warning(f"[soffice] soffice binary: {soffice}")

    # Ensure the file is world-readable (gunicorn may write with restrictive umask)
    os.chmod(docx_path, 0o644)

    result = subprocess.run(
        [
            soffice,
            '--headless',
            '--norestore',
            '--nofirststartwizard',
            '--convert-to', 'pdf',
            '--outdir', out_dir,
            docx_path,
        ],
        capture_output=True,
        env=env,
        timeout=60,
    )

    stdout = result.stdout.decode('utf-8', errors='replace')
    stderr = result.stderr.decode('utf-8', errors='replace')
    logging.warning(f"[soffice] returncode: {result.returncode}")
    logging.warning(f"[soffice] stdout: {stdout}")
    logging.warning(f"[soffice] stderr: {stderr}")

    if result.returncode != 0:
        raise RuntimeError(
            f'LibreOffice exited with code {result.returncode}. stderr: {stderr}'
        )

    pdf_name = os.path.splitext(os.path.basename(docx_path))[0] + '.pdf'
    pdf_path = os.path.join(out_dir, pdf_name)
    if not os.path.isfile(pdf_path) or os.path.getsize(pdf_path) == 0:
        raise RuntimeError(
            f'LibreOffice produced no output for {docx_path!r}. stdout: {stdout} stderr: {stderr}'
        )
    return pdf_path


# ─── Health ──────────────────────────────────────────────────────────────────

@app.route('/flask/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'flask'})


# ─── Comunicado ──────────────────────────────────────────────────────────────

@app.route('/flask/comunicado/process', methods=['POST', 'OPTIONS'])
def comunicado_process():
    """
    Accepts multipart form-data:
      file  — .docx file (required)
      plain — "true" | "false"  generate reformatted plain .docx
      pdf   — "true" | "false"  generate PDF via LibreOffice

    Returns the first generated file as a download (plain takes priority over pdf).
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    if not file.filename.lower().endswith('.docx'):
        return jsonify({'error': 'Only .docx files are supported'}), 400

    want_plain = request.form.get('plain') == 'true'
    want_pdf   = request.form.get('pdf')   == 'true'

    if not want_plain and not want_pdf:
        return jsonify({'error': 'Selecciona al menos una salida'}), 400

    uid = uuid.uuid4().hex
    work_dir = os.path.join(_OUTPUT_DIR, uid)
    os.makedirs(work_dir, exist_ok=True)

    original_path = os.path.join(work_dir, 'original.docx')
    file.save(original_path)

    # Base name derived from the uploaded filename (used for all outputs)
    upload_stem = os.path.splitext(file.filename)[0]

    # ── Plain .docx (reformatted) ─────────────────────────────────────────
    final_docx, docx_filename = None, None
    if want_plain:
        docx_output = os.path.join(work_dir, 'plain.docx')
        try:
            docx_filename = process_comunicado(original_path, docx_output)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        final_docx = os.path.join(work_dir, docx_filename)
        os.rename(docx_output, final_docx)

    # ── PDF — always from the ORIGINAL uploaded file, never the reformatted version ──
    pdf_path, pdf_filename = None, None
    if want_pdf:
        pdf_filename = upload_stem + '.pdf'
        try:
            raw_pdf = _convert_docx_to_pdf_soffice(original_path, work_dir)
        except Exception as e:
            return jsonify({'error': f'PDF conversion failed: {e}'}), 500
        pdf_path = os.path.join(work_dir, pdf_filename)
        os.rename(raw_pdf, pdf_path)

    # ── Return ────────────────────────────────────────────────────────────
    if want_plain:
        return send_file(
            final_docx,
            as_attachment=True,
            download_name=docx_filename,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

    return send_file(
        pdf_path,
        as_attachment=True,
        download_name=pdf_filename,
        mimetype='application/pdf',
    )


# ─── Merge PDF ───────────────────────────────────────────────────────────────

@app.route('/flask/merge/merge', methods=['POST', 'OPTIONS'])
def merge_merge():
    """
    Accepts multipart form-data:
      files[]     — one or more .pdf or .docx files (order = merge order)
      enumerate   — "true" | "false"  add "Pag. n/total" headers
      output_name — desired filename for the download (default: merged_output.pdf)

    Returns the merged PDF as a download.
    DOCX files are converted to PDF via LibreOffice (preferred) or docx2pdf.
    """
    files = request.files.getlist('files') or request.files.getlist('files[]')
    if not files:
        files = [v for v in request.files.values() if v and getattr(v, 'filename', None)]
    files = [f for f in files if f and getattr(f, 'filename', None)]

    if not files:
        return jsonify({'error': 'No files uploaded. Select one or more PDF or DOCX files.'}), 400

    enumerate_pages = request.form.get('enumerate', 'false').lower() in ('1', 'true', 'yes')
    output_name = (request.form.get('output_name', '').strip() or 'merged_output')
    if not output_name.endswith('.pdf'):
        output_name += '.pdf'

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        paths = []
        name_count: dict[str, int] = {}
        for f in files:
            base = f.filename or 'file'
            name_count[base] = name_count.get(base, 0) + 1
            if name_count[base] > 1:
                stem, ext = base.rsplit('.', 1) if '.' in base else (base, '')
                base = f'{stem}_{name_count[base]}.{ext}' if ext else f'{stem}_{name_count[base]}'
            path = tmp / base
            path.write_bytes(f.read())
            paths.append(path)

        try:
            out_path = tmp / output_name
            build_merged_pdf(paths, out_path, enumerate=enumerate_pages, temp_dir=tmp)
            pdf_bytes = out_path.read_bytes()
            return send_file(
                io.BytesIO(pdf_bytes),
                as_attachment=True,
                download_name=output_name,
                mimetype='application/pdf',
            )
        except Exception as e:
            return jsonify({'error': str(e)}), 500


# ─── Entry point ─────────────────────────────────────────────────────────────

with app.app_context():
    print([str(rule) for rule in app.url_map.iter_rules()])

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(port=port, debug=True)
