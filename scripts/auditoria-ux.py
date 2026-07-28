"""Auditoria de UX medible de Iglesia App.

Recorre las vistas principales en varios anchos y en ambos temas, y MIDE cuatro
cosas que a ojo no se estiman: area tactil, nombre accesible de los botones de
solo icono, contraste de texto y desborde horizontal.

No siembra datos: espera una BD ya preparada y un servidor corriendo. Ese servidor
debe arrancar con DISABLE_RATE_LIMIT=1: el recorrido completo hace unas 260
llamadas y el limitador general corta en 100 cada 15 min por IP.

    python scripts/auditoria-ux.py --url http://localhost:3000 \
        --iglesia MONTESION --usuario lider --password demo1234 \
        --salida auditoria-ux.json --capturas ./capturas

Un hallazgo desaparece del JSON cuando esta realmente arreglado: por eso el
mismo script sirve de linea base antes de tocar nada y de regresion despues.
"""
import argparse
import json
import os
import sys
from playwright.sync_api import sync_playwright

# Vistas del recorrido: (clave de navTo, etiqueta, preparacion opcional).
# Se omiten panel_obispo y superadmin a proposito: los usa una sola persona.
VISTAS = [
    ("inicio", "Inicio", None),
    ("calendario", "Calendario", None),
    ("calendario", "Calendario (dia abierto)", "dia"),
    ("anuncios", "Anuncios", None),
    ("mensajes", "Mensajes", None),
    ("directorio", "Directorio", None),
    ("organizacion", "Organizacion", None),
    ("organizacion", "Organizacion (hoja)", "hoja"),
    ("tesoreria", "Tesoreria", None),
    ("asistencia", "Asistencia", None),
    ("mi_grupo", "Mi Grupo", None),
]

ANCHOS = [(390, "movil"), (768, "tablet"), (1280, "escritorio")]
TEMAS = ["light", "dark"]

# --- Chequeos que corren DENTRO de la pagina -------------------------------
# Se ejecutan sobre el DOM ya renderizado: miden lo que el usuario ve, no lo
# que dice el CSS (un boton con padding generoso puede encogerse por flex).
JS_CHEQUEOS = r"""
() => {
  const hallazgos = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const selector = (el) => {
    if (el.id) return '#' + el.id;
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const txt = (el.textContent || '').trim().slice(0, 30);
    return el.tagName.toLowerCase() + cls + (txt ? ` "${txt}"` : '');
  };

  // 1) Area tactil, en dos niveles para no ahogar lo grave entre lo aceptable:
  //    - critica: por debajo de 24x24, el minimo exigible de WCAG 2.5.8 (AA).
  //    - baja: por debajo de 44x44, el objetivo comodo de WCAG 2.5.5 (AAA)
  //      y de las guias de Apple. Un item de menu de 42px de alto cae aqui y
  //      en la practica se toca sin problema: es un aviso, no un defecto.
  const clickables = [...document.querySelectorAll('button, .btn, .link, .nav-item, a[onclick], [role=button], input[type=checkbox]')];
  for (const el of clickables) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const menor = Math.min(r.width, r.height);
    if (menor < 24) {
      hallazgos.push({ tipo: 'area_tactil_critica', selector: selector(el),
        medicion: `${Math.round(r.width)}x${Math.round(r.height)}`, umbral: '24x24 (WCAG 2.5.8 AA)' });
    } else if (r.width < 44 || r.height < 44) {
      hallazgos.push({ tipo: 'area_tactil_baja', selector: selector(el),
        medicion: `${Math.round(r.width)}x${Math.round(r.height)}`, umbral: '44x44 (recomendado)' });
    }
  }

  // 2) Boton de solo icono sin nombre accesible: el lector de pantalla solo dice "boton".
  for (const el of [...document.querySelectorAll('button, .link, [role=button]')]) {
    if (!visible(el)) continue;
    const texto = (el.innerText || '').replace(/\s+/g, '');
    const soloIcono = texto.length === 0 || (texto.length <= 2 && !/[a-zA-Z0-9]/.test(texto));
    const nombre = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby');
    if (soloIcono && !nombre) {
      hallazgos.push({ tipo: 'sin_nombre_accesible', selector: selector(el),
        medicion: texto ? `solo "${texto}"` : 'sin texto', umbral: 'aria-label o title' });
    }
  }

  // 3) Contraste de texto (WCAG 2.1 AA).
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = [c.r, c.g, c.b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  // Devuelve el color de fondo efectivo, o null si en la cadena hay un degradado
  // o una imagen: ahi el contraste depende del punto exacto del pixel y este
  // chequeo no puede decidir. Sin este corte, el texto blanco sobre un hero con
  // degradado se reporta como "1.08:1", que es falso.
  const fondoDe = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgb(s.backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const conTexto = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el)) return false;
    return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  });
  for (const el of conTexto) {
    const s = getComputedStyle(el);
    const fg = rgb(s.color);
    if (!fg || fg.a < 0.5) continue;
    const bg = fondoDe(el);
    if (!bg) continue;   // fondo con degradado o imagen: no medible aqui
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    const minimo = grande ? 3 : 4.5;
    if (ratio < minimo) {
      hallazgos.push({ tipo: 'contraste', selector: selector(el),
        medicion: `${ratio.toFixed(2)}:1 (${s.color} sobre rgb(${bg.r},${bg.g},${bg.b}), ${px}px)`,
        umbral: `${minimo}:1` });
    }
  }

  // 4) Desborde horizontal: obliga a scroll lateral en movil.
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    hallazgos.push({ tipo: 'desborde_horizontal', selector: 'html',
      medicion: `${de.scrollWidth}px de contenido en ${de.clientWidth}px de viewport`, umbral: 'sin scroll lateral' });
  }
  return hallazgos;
}
"""


def entrar(page, url, iglesia, usuario, password):
    page.goto(url)
    page.wait_for_load_state("networkidle")
    page.fill("#iglesia", iglesia)
    page.locator('.step[data-step="1"] button').last.click()
    page.fill("#usuario", usuario)
    page.locator('.step[data-step="2"] button').last.click()
    page.fill("#password", password)
    page.locator('.step[data-step="3"] button').last.click()
    # La puerta de consentimiento legal solo aparece la primera vez.
    try:
        page.wait_for_selector("#cons-chk", timeout=4000)
        page.check("#cons-chk")
        page.click('button:has-text("Acepto y continúo")')
    except Exception:
        pass
    page.wait_for_selector("#app:not(.hidden)", timeout=15000)
    page.wait_for_load_state("networkidle")


def preparar(page, extra):
    """Abre el sub-estado de una vista (un dia del calendario, una hoja)."""
    if extra == "dia":
        celda = page.locator(".cal-cell:not(.empty)")
        if celda.count():
            celda.first.click()
            page.wait_for_timeout(500)
    elif extra == "hoja":
        tarjeta = page.locator("#org-lista .item-card")
        if tarjeta.count():
            tarjeta.first.click()
        else:
            page.once("dialog", lambda d: d.accept("Lista de prueba"))
            page.click('button:has-text("Nueva lista")')
        page.wait_for_timeout(800)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--iglesia", required=True)
    ap.add_argument("--usuario", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--salida", default="auditoria-ux.json")
    ap.add_argument("--capturas", default="capturas-ux")
    args = ap.parse_args()

    os.makedirs(args.capturas, exist_ok=True)
    hallazgos = []

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)

        # Se entra UNA sola vez y se reutiliza la sesion: el limitador de login
        # es de 5 intentos por IP cada 15 min, y un login por combinacion
        # (3 anchos x 2 temas) lo agota y bloquea la propia auditoria.
        ctx0 = navegador.new_context(viewport={"width": 1280, "height": 900})
        page0 = ctx0.new_page()
        entrar(page0, args.url, args.iglesia, args.usuario, args.password)
        # El token se inyecta a mano en cada contexto: storage_state() no siempre
        # arrastra el localStorage, y sin token cada vista volveria al login.
        token = page0.evaluate("localStorage.getItem('token')")
        ctx0.close()
        if not token:
            print("no se obtuvo el token tras el login", file=sys.stderr)
            return 1

        for ancho, nombre_ancho in ANCHOS:
            for tema in TEMAS:
                ctx = navegador.new_context(viewport={"width": ancho, "height": 900})
                page = ctx.new_page()
                page.add_init_script(
                    f"localStorage.setItem('token', {json.dumps(token)});"
                    f"localStorage.setItem('ajustes', JSON.stringify({{tema:'{tema}'}}))"
                )
                page.goto(args.url)
                page.wait_for_selector("#app:not(.hidden)", timeout=15000)
                page.wait_for_load_state("networkidle")

                for clave, etiqueta, extra in VISTAS:
                    try:
                        page.evaluate(f"navTo('{clave}')")
                        page.wait_for_timeout(900)
                        if extra:
                            preparar(page, extra)
                        nuevos = page.evaluate(JS_CHEQUEOS)
                    except Exception as e:
                        nuevos = [{"tipo": "error_recorrido", "selector": "-", "medicion": str(e)[:120], "umbral": "-"}]
                    for h in nuevos:
                        h.update({"vista": etiqueta, "ancho": nombre_ancho, "px": ancho, "tema": tema})
                    hallazgos.extend(nuevos)
                    archivo = f"{etiqueta.replace(' ', '_').replace('(', '').replace(')', '')}-{nombre_ancho}-{tema}.png"
                    page.screenshot(path=os.path.join(args.capturas, archivo), full_page=True)
                    print(f"  {etiqueta} · {nombre_ancho} · {tema}: {len(nuevos)} hallazgo(s)")
                ctx.close()
        navegador.close()

    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(hallazgos, f, ensure_ascii=False, indent=2)

    print(f"\n{len(hallazgos)} hallazgos -> {args.salida}")
    resumen = {}
    for h in hallazgos:
        resumen[h["tipo"]] = resumen.get(h["tipo"], 0) + 1
    for tipo, n in sorted(resumen.items(), key=lambda x: -x[1]):
        print(f"  {tipo}: {n}")
    return 0


sys.exit(main())
