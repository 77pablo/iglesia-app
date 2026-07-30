"""Auditoria de UX medible de Iglesia App.

Recorre las vistas principales en varios anchos y en ambos temas, y MIDE cuatro
cosas que a ojo no se estiman: area tactil, nombre accesible de los botones de
solo icono, contraste de texto y desborde horizontal.

No siembra datos: espera una BD ya preparada y un servidor corriendo. Ese servidor
debe arrancar con DISABLE_RATE_LIMIT=1: el recorrido completo hace unas 400
llamadas y el limitador general corta en 100 cada 15 min.

    python scripts/auditoria-ux.py --url http://localhost:3061 \
        --iglesia MONTESION --password 1234 \
        --salida auditoria-ux.json --capturas ./capturas

VARIOS USUARIOS EN UNA SOLA CORRIDA
-----------------------------------
Ninguna persona ve todas las vistas: Administracion, Panel del Pastor, Reportes
y Cuidado son del pastor; Musica la EDITA el lider de musica; Ninos, la maestra
de Escuela Dominical; Mi Grupo solo lo ve quien pertenece a un grupo. Por eso
cada vista declara con QUE usuario se audita, el script entra una vez por usuario
(reutilizando el token) y fusiona los hallazgos en un unico JSON. Si una vista no
esta en el menu del usuario que la tiene asignada, no revienta: la anota en
`vistas_omitidas` del JSON y la nombra en el resumen de consola.

La contrasena es la MISMA para todos los usuarios de la semilla de demo (1234).
Con --usuarios pastor,marta se limita el recorrido a esas sesiones, util para
iterar sobre una vista sin esperar los cuatro recorridos completos.

El JSON de salida es un objeto: {"hallazgos": [...], "vistas_omitidas": [...]}.

Un hallazgo desaparece del JSON cuando esta realmente arreglado: por eso el
mismo script sirve de linea base antes de tocar nada y de regresion despues.
"""
import argparse
import json
import os
import sys
from playwright.sync_api import sync_playwright

# Vistas del recorrido: (clave de navTo, etiqueta, preparacion opcional, usuario).
# Se omiten panel_obispo y superadmin a proposito: los usa una sola persona.
# El usuario es el que MEJOR representa esa vista (quien la usa de verdad), no
# solo alguien que pueda abrirla: el pastor ve Musica y Ninos, pero en modo
# observador, sin los botones de edicion que son la mitad de la interfaz.
VISTAS = [
    ("inicio", "Inicio", None, "pastor"),
    ("calendario", "Calendario", None, "pastor"),
    ("calendario", "Calendario (dia abierto)", "dia", "pastor"),
    ("anuncios", "Anuncios", None, "pastor"),
    ("mensajes", "Mensajes", None, "pastor"),
    ("directorio", "Directorio", None, "pastor"),
    ("organizacion", "Organizacion", None, "pastor"),
    ("organizacion", "Organizacion (hoja)", "hoja", "pastor"),
    ("tesoreria", "Tesoreria", None, "pastor"),
    ("asistencia", "Asistencia", None, "pastor"),
    ("mi_grupo", "Mi Grupo", None, "abel"),
    # --- Las 7 que faltaban (28 jul 2026) ---
    ("mi_servicio", "Mi Servicio", None, "abel"),
    ("panel_pastor", "Panel del Pastor", None, "pastor"),
    ("reportes", "Reportes", None, "pastor"),
    ("cuidado_pastoral", "Cuidado Pastoral", None, "pastor"),
    ("cuidado_pastoral", "Cuidado Pastoral (caso)", "caso", "pastor"),
    ("admin", "Administracion", None, "pastor"),
    ("musicos", "Musica", None, "joaquin"),
    ("ninos", "Ninos", None, "marta"),
    ("ninos", "Ninos (clase abierta)", "clase", "marta"),
]

# Orden en que se entra a cada usuario. Solo se usan los que aparecen en VISTAS.
ORDEN_USUARIOS = ["pastor", "abel", "joaquin", "marta"]

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
  // Incluye los div con onclick (casillas del calendario, tarjetas de lista):
  // en esta app son blancos de toque de pleno derecho, y sin esto el chequeo
  // no los veia. Se excluyen los que no reciben el toque (pointer-events:none).
  const clickables = [...document.querySelectorAll('button, .btn, .link, .nav-item, [onclick], [role=button], input[type=checkbox]')]
    .filter(el => getComputedStyle(el).pointerEvents !== 'none');
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
    """Abre el sub-estado de una vista (un dia del calendario, una hoja, un caso)."""
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
            # El titulo se pide con modalPrompt(), un modal de la propia app:
            # ya no hay prompt() del navegador que atrapar con page.once.
            page.click('button:has-text("Nueva lista")')
            page.wait_for_selector("#mp-txt", timeout=5000)
            page.fill("#mp-txt", "Lista de prueba")
            page.click("#mp-ok")
        page.wait_for_timeout(800)
    elif extra == "caso":
        tarjeta = page.locator("#lista-casos .item-card")
        if tarjeta.count():
            tarjeta.first.click()
            page.wait_for_timeout(700)
    elif extra == "clase":
        tarjeta = page.locator("#clases .module-card")
        if tarjeta.count():
            tarjeta.first.click()
            page.wait_for_timeout(900)


def obtener_token(navegador, url, iglesia, usuario, password):
    """Entra UNA sola vez por usuario y devuelve su token.

    Un login por combinacion (3 anchos x 2 temas x 4 usuarios) agotaria el
    limitador de login (5 intentos / 15 min) aunque el servidor lo tenga
    desactivado, y ademas es lento sin ganar nada.
    """
    ctx = navegador.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    try:
        entrar(page, url, iglesia, usuario, password)
        # El token se inyecta a mano en cada contexto: storage_state() no siempre
        # arrastra el localStorage, y sin token cada vista volveria al login.
        return page.evaluate("localStorage.getItem('token')")
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:3061")
    ap.add_argument("--iglesia", required=True)
    ap.add_argument("--password", required=True,
                    help="contrasena COMUN a todos los usuarios de demo (en la semilla, 1234)")
    ap.add_argument("--usuarios", default="",
                    help="lista separada por comas para limitar el recorrido a esos usuarios (por defecto, todos los de VISTAS)")
    ap.add_argument("--salida", default="auditoria-ux.json")
    ap.add_argument("--capturas", default="capturas-ux")
    args = ap.parse_args()

    os.makedirs(args.capturas, exist_ok=True)
    hallazgos = []
    omitidas = []

    # Que usuarios hacen falta, en orden estable, y que vistas le toca a cada uno.
    pedidos = [u.strip() for u in args.usuarios.split(",") if u.strip()]
    usuarios = [u for u in ORDEN_USUARIOS if any(v[3] == u for v in VISTAS) and (not pedidos or u in pedidos)]

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)

        tokens = {}
        for usuario in usuarios:
            tokens[usuario] = obtener_token(navegador, args.url, args.iglesia, usuario, args.password)
            if not tokens[usuario]:
                print(f"no se obtuvo el token de '{usuario}' tras el login", file=sys.stderr)
                return 1
            print(f"sesion abierta: {usuario}")

        for usuario in usuarios:
            vistas_usuario = [v for v in VISTAS if v[3] == usuario]
            print(f"\n=== {usuario} · {len(vistas_usuario)} vista(s) ===")
            for ancho, nombre_ancho in ANCHOS:
                for tema in TEMAS:
                    ctx = navegador.new_context(viewport={"width": ancho, "height": 900})
                    page = ctx.new_page()
                    page.add_init_script(
                        f"localStorage.setItem('token', {json.dumps(tokens[usuario])});"
                        f"localStorage.setItem('ajustes', JSON.stringify({{tema:'{tema}'}}))"
                    )
                    page.goto(args.url)
                    page.wait_for_selector("#app:not(.hidden)", timeout=15000)
                    page.wait_for_load_state("networkidle")

                    for clave, etiqueta, extra, _u in vistas_usuario:
                        # Si la vista no esta en el menu de esta persona, no se
                        # audita una pantalla vacia (o de error) como si fuera
                        # real: se anota como omitida y se sigue.
                        if not page.evaluate(f"tieneModulo('{clave}')"):
                            omitidas.append({"vista": etiqueta, "clave": clave, "usuario": usuario,
                                             "ancho": nombre_ancho, "tema": tema})
                            print(f"  {etiqueta} · {nombre_ancho} · {tema}: OMITIDA (no visible para {usuario})")
                            continue
                        try:
                            page.evaluate(f"navTo('{clave}')")
                            page.wait_for_timeout(900)
                            if extra:
                                preparar(page, extra)
                            nuevos = page.evaluate(JS_CHEQUEOS)
                        except Exception as e:
                            nuevos = [{"tipo": "error_recorrido", "selector": "-", "medicion": str(e)[:120], "umbral": "-"}]
                        for h in nuevos:
                            h.update({"vista": etiqueta, "usuario": usuario,
                                      "ancho": nombre_ancho, "px": ancho, "tema": tema})
                        hallazgos.extend(nuevos)
                        archivo = f"{etiqueta.replace(' ', '_').replace('(', '').replace(')', '')}-{nombre_ancho}-{tema}.png"
                        page.screenshot(path=os.path.join(args.capturas, archivo), full_page=True)
                        print(f"  {etiqueta} · {nombre_ancho} · {tema}: {len(nuevos)} hallazgo(s)")
                    ctx.close()
        navegador.close()

    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump({"hallazgos": hallazgos, "vistas_omitidas": omitidas}, f, ensure_ascii=False, indent=2)

    print(f"\n{len(hallazgos)} hallazgos -> {args.salida}")
    resumen = {}
    for h in hallazgos:
        resumen[h["tipo"]] = resumen.get(h["tipo"], 0) + 1
    for tipo, n in sorted(resumen.items(), key=lambda x: -x[1]):
        print(f"  {tipo}: {n}")
    if omitidas:
        print(f"\n{len(omitidas)} combinacion(es) omitidas por permisos:")
        vistos = sorted({(o["vista"], o["usuario"]) for o in omitidas})
        for vista, usuario in vistos:
            print(f"  {vista} (no visible para {usuario})")
    return 0


sys.exit(main())
