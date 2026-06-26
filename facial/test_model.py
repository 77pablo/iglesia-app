# Prueba: cargar el modelo buffalo_l (descarga ~280MB la 1a vez)
import numpy as np
from insightface.app import FaceAnalysis

print("Inicializando InsightFace (buffalo_l, CPU)...")
app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))
print("OK: modelo cargado y listo.")

# Prueba con una imagen sintetica (no detectara cara, solo confirma el pipeline)
img = (np.random.rand(640, 640, 3) * 255).astype("uint8")
faces = app.get(img)
print(f"OK: pipeline ejecutado. Caras detectadas en imagen aleatoria: {len(faces)}")
print("El motor facial FUNCIONA en este equipo.")
