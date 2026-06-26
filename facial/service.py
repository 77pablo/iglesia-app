# ============================================================
#  Microservicio de reconocimiento facial  -  Fase 3
#  Flask en el puerto 5001. Carga InsightFace buffalo_l (CPU)
#  una sola vez al iniciar y expone /health y /embed.
# ============================================================
import base64
import io
import re

import numpy as np
import cv2
from flask import Flask, request, jsonify
from insightface.app import FaceAnalysis

app = Flask(__name__)

print("Inicializando InsightFace (buffalo_l, CPU)... puede tardar unos segundos.")
_engine = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
_engine.prepare(ctx_id=0, det_size=(640, 640))
print("OK: motor facial cargado y listo (puerto 5001).")


def _decode_image(b64_str):
    """Convierte un string base64 (con o sin prefijo data:) a una imagen BGR (numpy)."""
    if not b64_str:
        return None
    # Quitar el prefijo "data:image/...;base64,"
    if b64_str.startswith("data:"):
        b64_str = re.sub(r"^data:[^;]+;base64,", "", b64_str, count=1)
    try:
        raw = base64.b64decode(b64_str)
    except Exception:
        return None
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def _l2_normalize(vec):
    vec = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


@app.get("/health")
def health():
    return jsonify({"ok": True, "modelo": "buffalo_l", "puerto": 5001})


@app.post("/embed")
def embed():
    data = request.get_json(silent=True) or {}
    b64 = data.get("image") or data.get("image_b64")
    if not b64:
        return jsonify({"ok": False, "error": "Falta el campo 'image' o 'image_b64'"}), 400

    img = _decode_image(b64)
    if img is None:
        return jsonify({"ok": False, "error": "No se pudo decodificar la imagen"}), 400

    try:
        faces = _engine.get(img)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Error al procesar: {e}"}), 500

    if not faces:
        return jsonify({"ok": True, "faces": 0})

    # Si hay varias caras, usar la de mayor area (bbox = [x1, y1, x2, y2])
    def area(f):
        x1, y1, x2, y2 = f.bbox
        return abs((x2 - x1) * (y2 - y1))

    face = max(faces, key=area)
    emb = _l2_normalize(face.embedding)

    return jsonify({
        "ok": True,
        "faces": len(faces),
        "embedding": emb.tolist(),
        "det_score": float(getattr(face, "det_score", 0.0)),
    })


if __name__ == "__main__":
    # threaded=True permite varias capturas casi simultaneas del kiosko
    app.run(host="0.0.0.0", port=5001, threaded=True)
