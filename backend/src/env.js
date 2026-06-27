// ============================================================
//  Cargador minimo de .env (sin dependencias)
//  Lee backend/.env (si existe) y define las variables que aun no
//  esten en process.env. En produccion (Railway) NO hay .env: las
//  variables vienen del panel, y este modulo simplemente no hace nada.
//  IMPORTANTE: importar este modulo ANTES que cualquier otro que lea
//  process.env (db.js, push.js...).
// ============================================================
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

try {
  const txt = fs.readFileSync(envPath, 'utf8');
  for (const linea of txt.split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const clave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    // Quita comillas envolventes si las hay.
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'")))
      valor = valor.slice(1, -1);
    if (clave && !(clave in process.env)) process.env[clave] = valor;
  }
} catch { /* no hay .env: normal en produccion */ }
