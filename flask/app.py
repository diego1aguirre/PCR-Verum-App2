"""
PCR Verum — Flask service (port 5000)

Routes
------
GET  /flask/health                  — liveness probe
POST /flask/comunicado/process      — reformat .docx press-release
POST /flask/merge/merge             — merge PDF/DOCX files with optional page numbers

DOCX→PDF conversion is handled by Gotenberg (external service).
Set the GOTENBERG_URL environment variable to point to your Gotenberg instance.
"""

import io
import os
import tempfile
import uuid
from pathlib import Path

import requests
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

# ─── Gotenberg helper (DOCX→PDF conversion) ──────────────────────────────────
# Set GOTENBERG_URL env var to your Gotenberg service URL.
# Default points to the shared Railway deployment.


def _convert_docx_to_pdf_gotenberg(docx_path: str) -> bytes:
    """Convert DOCX to PDF using Gotenberg API. Returns PDF bytes."""
    gotenberg_url = os.environ.get(
        'GOTENBERG_URL',
        'https://gotenberg-production-2ffa.up.railway.app',
    )
    endpoint = f'{gotenberg_url}/forms/libreoffice/convert'

    with open(docx_path, 'rb') as f:
        files = {
            'files': (
                os.path.basename(docx_path),
                f,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            )
        }
        response = requests.post(endpoint, files=files, timeout=120)

    if response.status_code != 200:
        raise RuntimeError(
            f'Gotenberg conversion failed: {response.status_code} {response.text}'
        )

    return response.content


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
      pdf   — "true" | "false"  generate PDF via Gotenberg

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
            pdf_bytes = _convert_docx_to_pdf_gotenberg(original_path)
        except Exception as e:
            return jsonify({'error': f'PDF conversion failed: {e}'}), 500
        pdf_path = os.path.join(work_dir, pdf_filename)
        with open(pdf_path, 'wb') as f:
            f.write(pdf_bytes)

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
    DOCX files are converted to PDF via Gotenberg (through pdf_pipeline).
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
