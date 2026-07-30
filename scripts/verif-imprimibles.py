"""Comprueba los DOS papeles de la hoja de Organizacion en el navegador.

Ninguna prueba de Node ve esto: son reglas de @media print, y la unica forma de
mirarlas sin gastar papel es page.emulate_media(media='print').

Espera un servidor corriendo con DISABLE_RATE_LIMIT=1 y la BD de demo sembrada.
El limitador general corta a las 100 peticiones por persona cada 15 minutos y
este recorrido hace muchas mas.

    python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas ./capturas
"""
import argparse
import sys
from playwright.sync_api import sync_playwright

fallos = []


def check(ok, etiqueta, detalle=""):
    print(("  OK   " if ok else "  FALLA") + " | " + etiqueta + ((" -> " + str(detalle)) if detalle else ""))
    if not ok:
        fallos.append(etiqueta + " -> " + str(detalle))


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


def hoja_nueva_con_gastos(page, titulo):
    """Crea SIEMPRE una hoja nueva y la deja con cosas y un gasto.

    Se crea nueva en vez de abrir la primera de la lista a proposito: este guion
    crea hojas al correr, asi que en la segunda corrida "la primera" ya no es la
    que uno cree. Una hoja propia por corrida hace el resultado repetible.
    """
    page.evaluate("navTo('organizacion')")
    page.wait_for_timeout(900)
    page.once("dialog", lambda d: d.accept(titulo))
    page.click('button:has-text("Nueva lista")')
    page.wait_for_timeout(1200)

    for nombre, cant in [("Bebidas", 6), ("Pan amasado", 20)]:
        page.fill("#org-cosa-nombre", nombre)
        page.fill("#org-cosa-cant", str(cant))
        page.click('#org-cosas ~ div button:has-text("Añadir")')
        page.wait_for_timeout(700)

    page.fill("#org-gasto-concepto", "Carbon")
    page.fill("#org-gasto-monto", "8000")
    page.locator('button:has-text("Añadir")').last.click()
    page.wait_for_timeout(800)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3071")
    ap.add_argument("--capturas", default=".")
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errores = []
        page.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)

        entrar(page, args.url, "MONTESION", "pastor", "1234")
        hoja_nueva_con_gastos(page, "Almuerzo de jovenes")

        print("\n[A] La hoja de cosas (el papel que se pega en la puerta)")
        page.emulate_media(media="print")
        page.wait_for_timeout(200)
        check(page.locator(".solo-print").first.is_visible(), "sale la cabecera de la iglesia")
        check(page.locator(".card-cosas").first.is_visible(), "salen las cosas a llevar")
        check(not page.locator(".card-gastos").first.is_visible(),
              "NO salen los gastos (se pega en la puerta)")
        page.screenshot(path=args.capturas + "/papel-cosas.png", full_page=True)
        page.emulate_media(media="screen")

        print("\n[B] La rendicion (el papel que va al tesorero)")
        boton = page.locator('button:has-text("Rendición")')
        check(boton.count() == 1, "hay un boton de rendicion", boton.count())

        # Se sustituye print() para capturar el estado EXACTO en que el
        # navegador leeria el documento: titulo y clase puestos.
        page.evaluate("""() => {
            window.__alImprimir = null;
            window.print = () => { window.__alImprimir = {
                titulo: document.title,
                modo: document.body.classList.contains('modo-rendicion')
            }; };
        }""")
        boton.first.click()
        page.wait_for_timeout(250)
        estado = page.evaluate("window.__alImprimir")
        check(estado is not None, "se llamo a print()", estado)
        check(estado and estado["modo"], "el modo rendicion estaba puesto al imprimir", estado)
        check(estado and "Rendición" in estado["titulo"],
              "el archivo se llamaria 'Rendicion - ...'", estado and estado["titulo"])

        # El dialogo seguiria abierto: aqui se mira el papel.
        page.emulate_media(media="print")
        page.wait_for_timeout(200)
        check(page.locator(".card-gastos").first.is_visible(), "AHORA si salen los gastos")
        check(not page.locator(".card-cosas").first.is_visible(), "no salen las cosas a llevar")
        check(page.locator(".solo-print").first.is_visible(), "sigue la cabecera de la iglesia")
        check(not page.locator(".org-hora").first.is_visible(),
              "la hora de llegada no sale en la rendicion")
        gcard = page.locator(".card-gastos").first.inner_text()
        check("Quién puso qué" in gcard, "sale el resumen de quien puso que", gcard[:60])
        check("Añadir" not in gcard, "NO sale el formulario de anadir gastos")
        check("Borrar esta lista" not in gcard, "NO sale el enlace de borrar")
        page.screenshot(path=args.capturas + "/papel-rendicion.png", full_page=True)
        page.emulate_media(media="screen")

        print("\n[C] El estado no se queda pegado")
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        page.wait_for_timeout(150)
        check(not page.evaluate("document.body.classList.contains('modo-rendicion')"),
              "tras afterprint la clase se quita")
        check(page.title() == "Iglesia App", "y el titulo vuelve", page.title())

        # Autocurado: aunque la clase quede pegada, el papel normal se arregla solo.
        page.evaluate("document.body.classList.add('modo-rendicion')")
        page.evaluate("window.print = () => {};")
        page.locator('button:has-text("Imprimir / PDF")').first.click()
        page.wait_for_timeout(250)
        check(not page.evaluate("document.body.classList.contains('modo-rendicion')"),
              "imprimir la hoja de cosas cura una clase pegada")

        # Hoja SIN gastos: es otro estado, hace falta una hoja nueva.
        print("\n[D] Sin gastos no hay boton de rendicion")
        page.evaluate("navTo('organizacion')")
        page.wait_for_timeout(900)
        page.once("dialog", lambda d: d.accept("Hoja sin gastos"))
        page.click('button:has-text("Nueva lista")')
        page.wait_for_timeout(1200)
        check(page.locator('button:has-text("Rendición")').count() == 0,
              "sin gastos, el boton no se pinta",
              page.locator('button:has-text("Rendición")').count())

        reales = [e for e in errores if "favicon" not in e.lower()]
        check(not reales, "sin errores de consola", reales[:3])
        browser.close()

    print("\n" + "=" * 60)
    if fallos:
        print("FALLAN " + str(len(fallos)) + ":")
        for f in fallos:
            print("  - " + f)
        sys.exit(1)
    print("TODO OK")


if __name__ == "__main__":
    main()
