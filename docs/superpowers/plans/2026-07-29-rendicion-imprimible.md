# Rendición imprimible — Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para ejecutarlo tarea por tarea. Los pasos usan casillas (`- [x]`) para ir marcando.

**Objetivo:** un segundo imprimible de la hoja de Organización —la rendición de gastos— que el líder le lleva al tesorero.

**Arquitectura:** todo en frontend y CSS. Una clase `modo-rendicion` en el `<body>` decide cuál de los dos papeles sale, y las reglas viven en el `@media print` que ya existe. No se toca el backend: `GET /api/organizacion/:id` ya devuelve gastos, total y aportes.

**Stack:** JavaScript sin framework (`web/app.js`), CSS plano (`web/styles.css`), verificación con Python + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-29-rendicion-imprimible-design.md`

## Restricciones globales

- **Cero dependencias nuevas.** Ni de npm ni de CDN. La CSP de `helmet` no permite orígenes externos (`backend/src/server.js`).
- **Cero cambios de backend.** Si algún test de Node cambia, el trabajo se salió del alcance. Los 317 deben seguir en verde.
- **Todo en español**, incluidos comentarios y textos de interfaz. El cuerpo de los mensajes de commit va en ASCII (sin tildes ni ñ), como el resto del repo.
- **Nada de `git push`.** Los commits se dejan hechos; el push lo hace Pablo con GitHub Desktop.
- **Escapar siempre** lo que venga de la base de datos con `escHtml()` antes de meterlo en HTML.
- La verificación real es el navegador. Ninguna prueba de Node ve nada de esto.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `scripts/verif-imprimibles.py` | Comprueba los dos papeles en el navegador. Es el arnés de pruebas de esta funcionalidad y queda en el repo como regresión. | Crear (Tarea 1) |
| `web/app.js` | Clases estables en el marcado, botón de rendición, `Org.imprimirRendicion()`, candados de estado. | Modificar (Tareas 1, 2, 3) |
| `web/styles.css` | Reglas de `modo-rendicion` dentro de `@media print`. | Modificar (Tareas 2, 3) |
| `ESTADO.md` | Dejar constancia. | Modificar (Tarea 3) |

---

## Preparación (una vez, antes de la Tarea 1)

Hace falta un servidor con datos. **No usar `with_server.py`**: en Windows dice "Server stopped" pero el proceso node sobrevive, y la siguiente corrida se conecta al servidor huérfano con su BD vieja, dando resultados falsos sin avisar.

- [x] **Sembrar una base de datos temporal**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app/backend"
SCRATCH="C:/Users/pdani/AppData/Local/Temp/claude/C--Users-pdani-Documents-App-Iglesia-app/7b74f27a-f58a-40fa-935e-3b467206d928/scratchpad"
rm -f "$SCRATCH/verif.db"
DB_PATH="$SCRATCH/verif.db" JWT_SECRET="verificacion-local-solo-para-pruebas-1234567890" SEED_ON_EMPTY=1 node src/seed.js
```

Esperado: `[seed] Datos de prueba creados:` con la iglesia `MONTESION` y los usuarios (contraseña `1234`).

- [x] **Arrancar el servidor** (PowerShell, con `-PassThru` para poder matarlo después)

```powershell
$scratch = "C:\Users\pdani\AppData\Local\Temp\claude\C--Users-pdani-Documents-App-Iglesia-app\7b74f27a-f58a-40fa-935e-3b467206d928\scratchpad"
$env:DB_PATH = "$scratch\verif.db"
$env:JWT_SECRET = "verificacion-local-solo-para-pruebas-1234567890"
$env:DISABLE_RATE_LIMIT = "1"
$env:PORT = "3071"
$env:SEED_ON_EMPTY = "0"
$env:UPLOADS_DIR = "$scratch\uploads"
$p = Start-Process node -ArgumentList "src/server.js" -WorkingDirectory "C:\Users\pdani\Documents\App-Iglesia\app\backend" -PassThru -NoNewWindow -RedirectStandardOutput "$scratch\srv.log" -RedirectStandardError "$scratch\srv.err"
"PID=$($p.Id)"
```

`DISABLE_RATE_LIMIT=1` es obligatorio: el limitador corta a las 100 peticiones por persona cada 15 minutos y el recorrido hace muchas más.

Guarda el PID. Al terminar la Tarea 3: `Stop-Process -Id <PID> -Force`.

---

## Tarea 1: El arnés, con el papel de hoy como línea base

Antes de cambiar nada, se escribe el guion que comprueba lo que ya funciona. Si el papel de rendición rompiera la hoja de cosas, esta tarea es la que lo delata.

**Archivos:**
- Crear: `scripts/verif-imprimibles.py`
- Modificar: `web/app.js` (clases estables en el marcado, sin cambio visible)

**Interfaces:**
- Produce: las clases CSS `card-cosas`, `card-gastos` y `org-hora`, de las que dependen las Tareas 2 y 3.

- [x] **Paso 1: Escribir el guion de verificación con las comprobaciones de HOY**

Crear `scripts/verif-imprimibles.py`:

```python
"""Comprueba los DOS papeles de la hoja de Organizacion en el navegador.

Ninguna prueba de Node ve esto: son reglas de @media print, y la unica forma
de mirarlas sin gastar papel es page.emulate_media(media='print').

Espera un servidor corriendo con DISABLE_RATE_LIMIT=1 y la BD de demo sembrada.

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


def abrir_hoja_con_gastos(page):
    """Deja abierta una hoja con cosas y con al menos un gasto."""
    page.evaluate("navTo('organizacion')")
    page.wait_for_timeout(900)
    tarjeta = page.locator("#org-lista .item-card")
    if tarjeta.count():
        tarjeta.first.click()
    else:
        page.once("dialog", lambda d: d.accept("Almuerzo de jovenes"))
        page.click('button:has-text("Nueva lista")')
    page.wait_for_timeout(1200)

    if page.locator(".org-row").count() == 0:
        for nombre, cant in [("Bebidas", 6), ("Pan amasado", 20)]:
            page.fill("#org-cosa-nombre", nombre)
            page.fill("#org-cosa-cant", str(cant))
            page.click('#org-cosas ~ div button:has-text("Añadir")')
            page.wait_for_timeout(700)

    if "Sin gastos" in page.locator("#org-gastos").inner_text():
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
        abrir_hoja_con_gastos(page)

        print("\n[A] La hoja de cosas (el papel que se pega en la puerta)")
        page.emulate_media(media="print")
        page.wait_for_timeout(200)
        check(page.locator(".solo-print").first.is_visible(), "sale la cabecera de la iglesia")
        check(page.locator(".card-cosas").first.is_visible(), "salen las cosas a llevar")
        check(not page.locator(".card-gastos").first.is_visible(),
              "NO salen los gastos (se pega en la puerta)")
        page.screenshot(path=args.capturas + "/papel-cosas.png", full_page=True)
        page.emulate_media(media="screen")

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
```

- [x] **Paso 2: Correrlo y verlo FALLAR**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app"
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: **FALLA**. Las clases `.card-cosas` y `.card-gastos` todavía no existen, así que Playwright no encuentra los elementos y revienta con un error de localizador. Eso es lo que se va a arreglar en el paso siguiente.

- [x] **Paso 3: Poner las clases estables en el marcado**

En `web/app.js`, dentro de `Org._render()`. Las tres cards son hoy `.card` a secas; se les da nombre para poder decidir cuál sale en cada papel. **Ningún cambio visible en pantalla.**

Sustituir la card del contexto:

```javascript
      <div class="card">
        <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''}</div>
        <div style="margin-top:10px"><b>🕐 Hora de llegada:</b>
```

por:

```javascript
      <div class="card">
        <div class="muted small">${h.evento_id?'📅 De un evento':'📝 Lista suelta'}${fecha?' · '+fechaTxt(fecha):''}</div>
        <!-- org-hora: la rendicion la oculta. Al tesorero la hora de llegada no
             le dice nada, y comparte card con el contexto, que si sale. -->
        <div class="org-hora" style="margin-top:10px"><b>🕐 Hora de llegada:</b>
```

Sustituir la apertura de la card de cosas:

```javascript
      <div class="card" style="margin-top:14px"><h3 style="font-size:16px">📦 Cosas a llevar</h3>
```

por:

```javascript
      <div class="card card-cosas" style="margin-top:14px"><h3 style="font-size:16px">📦 Cosas a llevar</h3>
```

Sustituir la apertura de la card de gastos:

```javascript
      <div class="card no-print" style="margin-top:14px"><h3 style="font-size:16px">💵 Gastos</h3>
```

por:

```javascript
      <div class="card no-print card-gastos" style="margin-top:14px"><h3 style="font-size:16px">💵 Gastos</h3>
```

Se conserva `no-print`: en el papel normal la card sigue sin salir, que es la decisión de diseño de siempre.

- [x] **Paso 4: Correrlo y verlo PASAR**

```bash
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: `TODO OK`, con las cuatro comprobaciones del bloque `[A]` en verde.

- [x] **Paso 5: Comprobar que el backend no se movió**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app/backend" && npm test 2>&1 | tail -8
```

Esperado: `tests 317 / pass 317 / fail 0`.

- [x] **Paso 6: Commit**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app"
git add scripts/verif-imprimibles.py web/app.js
git commit -m "test(organizacion): arnes que mira los papeles antes de tocarlos

Ninguna prueba de Node ve las reglas de @media print, asi que el papel se
comprueba con Playwright y emulate_media(media='print'). Este guion fija
primero lo que YA funciona -- la hoja de cosas sale con la cabecera y las
cosas, y SIN gastos -- para que la rendicion que viene detras no la rompa sin
que nadie se entere.

Las cards pasan a tener nombre (card-cosas, card-gastos) y la fila de la hora
tambien (org-hora). Sin cambio visible: son enganches para decidir que sale en
cada papel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Tarea 2: El modo rendición

**Archivos:**
- Modificar: `web/app.js` (botón, `Org.imprimirRendicion()`, candado en `Org.imprimir()`, `no-print` en los controles internos de la card de gastos)
- Modificar: `web/styles.css` (reglas de `.modo-rendicion` dentro de `@media print`)
- Modificar: `scripts/verif-imprimibles.py` (bloque `[B]`)

**Interfaces:**
- Consume: `card-cosas`, `card-gastos`, `org-hora` (Tarea 1).
- Produce: `Org.imprimirRendicion()` y la clase `modo-rendicion` en `<body>`; la Tarea 3 añade la firma dentro de ese modo.

- [x] **Paso 1: Escribir las comprobaciones que fallan**

En `scripts/verif-imprimibles.py`, insertar este bloque justo antes de `reales = [e for e in errores ...]`:

```python
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
```

- [x] **Paso 2: Correrlo y verlo FALLAR**

```bash
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: **FALLA** en `hay un boton de rendicion -> 0`. El bloque `[A]` sigue en verde.

- [x] **Paso 3: Añadir el botón**

En `web/app.js`, en la `btn-fila`, después del botón de imprimir y antes del de volver. Solo se pinta si hay gastos:

```javascript
          <button class="btn ghost small-btn" onclick="Org.imprimir()"
            title="En el diálogo de impresión, elige &quot;Guardar como PDF&quot; en el destino">🖨️ Imprimir / PDF</button>
          ${(h.gastos&&h.gastos.length)?`<button class="btn ghost small-btn" onclick="Org.imprimirRendicion()"
            title="El papel de las cuentas, para llevárselo al tesorero">🧾 Rendición</button>`:''}
          <button class="btn ghost small-btn" onclick="vistaOrganizacion()">← Volver</button></div></div>
```

- [x] **Paso 4: Marcar `no-print` los controles internos de la card de gastos**

Hasta ahora no lo necesitaban: la card entera era invisible en papel. En modo rendición se vuelve visible, así que el formulario de añadir y el enlace de borrar **saldrían impresos**.

Sustituir:

```javascript
        ${ed?`<div class="row" style="gap:6px;margin-top:10px">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
```

por:

```javascript
        ${ed?`<div class="row no-print" style="gap:6px;margin-top:10px">
          <input id="org-gasto-concepto" placeholder="Ej. Pan">
```

Y sustituir:

```javascript
        ${ed?`<div style="margin-top:16px;text-align:right"><button class="link" style="color:var(--red-tx)" onclick="Org.borrarHoja()">🗑️ Borrar esta lista</button></div>`:''}
```

por:

```javascript
        ${ed?`<div class="no-print" style="margin-top:16px;text-align:right"><button class="link" style="color:var(--red-tx)" onclick="Org.borrarHoja()">🗑️ Borrar esta lista</button></div>`:''}
```

- [x] **Paso 5: Escribir `Org.imprimirRendicion()` y el candado de `Org.imprimir()`**

En `web/app.js`, sustituir el método `imprimir()` entero por estos dos. Se comparte el cuerpo en `_conPapel()` para no repetir los candados en dos sitios:

```javascript
  // Los dos papeles de la hoja pasan por aqui. `rendicion` decide cual: la
  // clase en el <body> es lo unico que mira el CSS de impresion.
  //
  // Restaurar va en 'afterprint' y NO justo despues de print(): en escritorio
  // print() bloquea hasta que se cierra el dialogo, pero en movil vuelve
  // enseguida y se restauraria antes de que el navegador lo lea. El
  // temporizador es la red de seguridad para el navegador que no dispare el
  // evento; restaurar dos veces no hace dano, dejarlo mal para siempre si.
  _conPapel(rendicion){
    const h=Org._hoja;
    // El modo se limpia SIEMPRE al empezar, no solo al terminar: sus reglas
    // viven dentro de @media print, asi que una clase pegada no se ve en
    // pantalla y sacaria los gastos en el siguiente papel normal. Asi se cura
    // sola en el proximo uso en vez de acumularse.
    document.body.classList.remove('modo-rendicion');
    if(!h){ window.print(); return; }
    const titulo=(h.evento&&h.evento.titulo)||h.titulo||'Lista';
    const fecha=(h.evento&&h.evento.fecha)||h.fecha;
    const previo=document.title;
    document.title=(rendicion?'Rendición — ':'')+titulo+(fecha?' — '+fechaTxt(fecha):'');
    if(rendicion) document.body.classList.add('modo-rendicion');
    const restaurar=()=>{ document.title=previo; document.body.classList.remove('modo-rendicion'); };
    window.addEventListener('afterprint',restaurar,{once:true});
    setTimeout(restaurar,60000);
    window.print();
  },
  // La hoja que se pega en la puerta de la iglesia: cosas a llevar, sin gastos.
  imprimir(){ Org._conPapel(false); },
  // El papel de las cuentas, para el tesorero: gastos, total y quien puso que.
  imprimirRendicion(){ Org._conPapel(true); },
```

- [x] **Paso 6: Escribir las reglas de impresión**

En `web/styles.css`, **dentro** del bloque `@media print{...}`, justo antes de la línea `.org-row{padding:10px 0;border-bottom:1px solid #ddd;}`:

```css
  /* ---- Modo rendicion: el segundo papel, el que va al tesorero ----
     Vencer a .no-print (display:none !important) exige !important Y mas
     especificidad: dos clases contra una. Sin las dos cosas, la card de gastos
     seguiria oculta y esto no saldria nunca -- y en pantalla todo se veria
     bien, que es lo que hace estos fallos tan caros de encontrar. */
  .modo-rendicion .card-gastos{display:block !important;}
  .modo-rendicion .card-cosas{display:none !important;}
  .modo-rendicion .org-hora{display:none !important;}
```

- [x] **Paso 7: Correrlo y verlo PASAR**

```bash
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: `TODO OK`. Bloques `[A]`, `[B]` y `[C]` en verde.

- [x] **Paso 8: Mirar la captura**

Abrir `$SCRATCH/papel-rendicion.png` y comprobar con los ojos: sale la cabecera de la iglesia, el título, los gastos con quién puso cada uno, el total, el resumen "Quién puso qué"; **no** salen las cosas a llevar, ni los botones, ni el formulario de añadir. Una aserción puede pasar y el papel verse mal igualmente.

- [x] **Paso 9: Commit**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app"
git add web/app.js web/styles.css scripts/verif-imprimibles.py
git commit -m "feat(organizacion): la rendicion de gastos, en papel, para el tesorero

El lider adelanta plata (o se la adelanta su gente) y despues tiene que
rendirle cuentas al tesorero para que la iglesia la devuelva. Ese papel no
existia: la hoja impresa sale a proposito sin gastos, porque se pega en la
puerta de la iglesia.

Ahora la misma vista da dos papeles. Una clase en el <body> decide cual, y las
reglas viven en el @media print que ya estaba. El contenido no hubo que
inventarlo: el bloque \"Quien puso que\" ya se pintaba dentro de la card de
gastos y solo llevaba la etiqueta no-print. Backend sin tocar.

El boton no aparece si la hoja no tiene gastos: llevarle al tesorero un papel
que dice \"Total: \$0\" es ruido.

Dos detalles que costaba ver y que se resolvieron aqui:
- Las reglas del modo viven DENTRO de @media print, asi que una clase pegada no
  se nota en pantalla pero sacaria los gastos en el siguiente papel normal, en
  la puerta de la iglesia. Se limpia al terminar Y al empezar, asi se cura sola.
- El formulario de anadir gastos y el enlace de borrar no llevaban no-print
  porque no les hacia falta: la card entera era invisible en papel. Al hacerla
  visible, se habrian impreso.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Tarea 3: La firma, y dejarlo dicho

**Archivos:**
- Modificar: `web/app.js` (bloque de firma)
- Modificar: `web/styles.css` (`.solo-rendicion`)
- Modificar: `scripts/verif-imprimibles.py` (comprobación de la firma)
- Modificar: `ESTADO.md`

**Interfaces:**
- Consume: la clase `modo-rendicion` (Tarea 2).

- [x] **Paso 1: Escribir la comprobación que falla**

En `scripts/verif-imprimibles.py`, dentro del bloque `[B]`, justo después de la comprobación `NO sale el enlace de borrar`:

```python
        firma = page.locator(".solo-rendicion")
        check(firma.count() == 1, "existe el bloque de firma", firma.count())
        check(firma.first.is_visible(), "la firma sale en el papel de rendicion")
        check("Recibí conforme" in firma.first.inner_text(), "dice 'Recibi conforme'",
              firma.first.inner_text())
```

Y en el bloque `[A]`, después de `NO salen los gastos`:

```python
        check(not page.locator(".solo-rendicion").first.is_visible(),
              "la firma NO sale en la hoja de cosas")
```

- [x] **Paso 2: Correrlo y verlo FALLAR**

```bash
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: **FALLA** en `existe el bloque de firma -> 0`.

- [x] **Paso 3: Añadir el bloque de firma**

En `web/app.js`, dentro de la card de gastos, justo después de `${aportes}`:

```javascript
        ${aportes}
        <!-- Solo en el papel de rendicion: el tesorero firma que recibio las
             cuentas. En pantalla no pinta nada, y en la hoja de la puerta
             tampoco (alli no hay cuentas que recibir). -->
        <div class="solo-rendicion">Recibí conforme: ______________________
          &nbsp;&nbsp;&nbsp; Fecha: ________________</div>
```

- [x] **Paso 4: Añadir el CSS**

En `web/styles.css`, junto a `.solo-print{display:none;}` (fuera de `@media print`):

```css
.solo-rendicion{display:none;}  /* solo en el papel de rendicion, ver @media print */
```

Y **dentro** de `@media print`, junto a las otras reglas de `.modo-rendicion`:

```css
  .modo-rendicion .solo-rendicion{display:block !important;margin-top:26px;
    padding-top:10px;border-top:1px solid #ccc;color:#000;}
```

Dos clases y `!important`: por lo mismo que la card de gastos, y además porque `.solo-rendicion{display:none}` vive **más abajo** en el archivo y a igual especificidad ganaría ella.

- [x] **Paso 5: Correrlo y verlo PASAR**

```bash
PYTHONIOENCODING=utf-8 python scripts/verif-imprimibles.py --url http://localhost:3071 --capturas "$SCRATCH"
```

Esperado: `TODO OK`, con las cuatro comprobaciones nuevas en verde.

- [x] **Paso 6: Correr la suite del backend por última vez**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app/backend" && npm test 2>&1 | tail -8
```

Esperado: `tests 317 / pass 317 / fail 0`. Si cambió algo, el trabajo se salió del alcance.

- [x] **Paso 7: Parar el servidor**

```powershell
Stop-Process -Id <PID> -Force
Get-NetTCPConnection -LocalPort 3071 -State Listen -ErrorAction SilentlyContinue
```

Esperado: nada escuchando en el 3071. Un servidor huérfano falsea la siguiente corrida.

- [x] **Paso 8: Actualizar `ESTADO.md`**

En la sección de la Fase 10 (Organización v2), añadir bajo la línea de **Imprimir**:

```markdown
- **Rendición** (29 jul): segundo imprimible de la misma hoja, para el tesorero — gastos, total, "Quién puso qué" y línea de firma; sin las cosas a llevar ni la hora de llegada. Una clase `modo-rendicion` en el `<body>` decide cuál de los dos papeles sale; las reglas viven en el `@media print` que ya existía y el contenido ya estaba pintado. Sin backend. El botón no aparece si no hay gastos. Se verifica con `scripts/verif-imprimibles.py`, porque ninguna prueba de Node ve una regla de impresión.
```

Y en "Abierto de verdad", bajo la sección de Organización ↔ Tesorería, sustituir la línea que empieza por **"Antes de escribir en `movimiento`, probar el papel"** por:

```markdown
- ✅ ~~**Antes de escribir en `movimiento`, probar el papel**~~ — hecho el 29 jul (ver Fase 10, *Rendición*). Queda por saber si en uso real basta con el papel o hace falta la integración; esa respuesta la da la iglesia usándolo, no otro spec.
```

- [x] **Paso 9: Commit**

```bash
cd "C:/Users/pdani/Documents/App-Iglesia/app"
git add web/app.js web/styles.css scripts/verif-imprimibles.py ESTADO.md
git commit -m "feat(organizacion): la rendicion se firma

Linea de \"Recibi conforme\" al pie del papel de rendicion: quien entrega las
cuentas quiere constancia de que las entrego. Solo en ese papel -- en la hoja
que se pega en la puerta no hay cuentas que recibir.

El !important y las dos clases no son adorno: .solo-rendicion se apaga MAS
ABAJO en el archivo que donde se enciende, y a igual especificidad ganaria la
de apagar. Es la misma trampa que la cabecera de la hoja impresa esta manana.

Verificado en el navegador con emulate_media(media='print'). 317 tests del
backend sin moverse, que es la senal de que esto no se salio de su alcance.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Autorrevisión del plan

**Cobertura del spec** — las ocho comprobaciones exigidas quedan repartidas así:

| Punto del spec | Dónde |
|---|---|
| 1. El botón aparece con gastos y no sin ellos | Tarea 2 paso 1, bloques `[B]` y `[D]` |
| 2. Modo rendición: gastos, total, resumen y firma sí; cosas no | Tarea 2 paso 1 y Tarea 3 paso 1 |
| 3. La hora de llegada no sale | Tarea 2 paso 1, bloque `[B]` |
| 4. `document.title` dice "Rendición" al llamar a `print()` | Tarea 2 paso 1 |
| 5. Regresión: el papel normal sigue sin gastos | Tarea 1 paso 1, bloque `[A]` |
| 6. La clase no queda pegada tras `afterprint` | Tarea 2 paso 1, bloque `[C]` |
| 7. Autocurado | Tarea 2 paso 1, bloque `[C]` |
| 8. Sin errores de consola | Tarea 1 paso 1 |

**Dos huecos encontrados y ya integrados** en la Tarea 2, paso 1 (no se dejaron aquí: quien ejecuta el plan tarea por tarea puede no leer esta sección):
1. El spec exige que el botón **no** aparezca sin gastos, y la primera versión solo comprobaba el caso con gastos. Es un estado distinto y necesita una hoja nueva → bloque `[D]`.
2. El spec exige que la hora de llegada no salga en la rendición, y no había ninguna comprobación → añadida al bloque `[B]`.

**Coherencia de nombres:** `card-cosas`, `card-gastos`, `org-hora`, `modo-rendicion`, `solo-rendicion`, `Org._conPapel()`, `Org.imprimir()`, `Org.imprimirRendicion()` — usados igual en todas las tareas. `Org.imprimir()` conserva su nombre, así que el `onclick` que ya existe en el marcado no cambia.

**Alcance:** una sola funcionalidad, tres tareas, cada una con su papel comprobable. No requiere descomponerse.
