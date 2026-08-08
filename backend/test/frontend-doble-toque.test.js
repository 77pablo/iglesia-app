// ============================================================
//  Que un doble toque no cree el registro dos veces, y que se vea.
//
//  Existia conBoton(), que apaga el boton mientras dura la peticion, pero:
//   - solo lo usaban 9 de ~79 manejadores que escriben, y justo se quedaban
//     fuera los que usa la gente no tecnica (guardar asistencia, crear una
//     clase, publicar un aviso, aceptar un servicio);
//   - y en las 703 lineas de styles.css NO habia ni una regla :disabled, asi
//     que como .btn trae su propio fondo el navegador no lo apagaba: la
//     proteccion estaba puesta y era INVISIBLE.
//
//  El caso que lo destapo: la maestra sube el PDF de la leccion desde datos
//  moviles. El aviso "Subiendo documento…" se borra solo a los 2,8 s, el boton
//  sigue igual, no pasa nada durante 20 s, vuelve a tocar "Guardar" -> dos
//  lecciones.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, '..', '..', 'web');
const fuente = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(WEB, 'styles.css'), 'utf8');
const lineas = fuente.split('\n');

// ⚠️ La parada es una heuristica y falla de dos maneras. Quedarse CORTO es
// ruidoso: el trozo sale a medias y revienta como SyntaxError dentro del
// new Function() de mas abajo, se ve. DESBORDARSE no revienta nada: si la
// declaracion no acaba en ';' ni en '}' -- una coma al final, o un comentario
// detras de la llave -- el bucle llega al final del fichero y esto devuelve
// desde la declaracion hasta el final de app.js. Las comprobaciones de abajo
// pasarian a buscar su cadena en medio archivo y dejarian de cubrir lo que
// cubrian, en verde. Por eso el assert del final: el segundo caso tambien
// tiene que hacer ruido.
function recortar(nombre) {
  const i = lineas.findIndex(l => new RegExp(`^(?:async function|function|const|let) ${nombre}\\b`).test(l));
  assert.ok(i >= 0, `no se encontro ${nombre} en web/app.js`);
  let saldo = 0, trozo = [], cerro = false;
  for (let j = i; j < lineas.length; j++) {
    const l = lineas[j];
    trozo.push(l);
    for (const ch of l) { if (ch === '{') saldo++; else if (ch === '}') saldo--; }
    if (saldo <= 0 && (l.trimEnd().endsWith(';') || l.trimEnd().endsWith('}'))) { cerro = true; break; }
  }
  assert.ok(cerro, `el recorte de ${nombre} llego al final de web/app.js sin cerrar: la parada (saldo a cero en una linea que acaba en ';' o en '}') no disparo nunca, asi que esto devolveria desde la declaracion hasta el final del fichero y las comprobaciones de abajo buscarian su cadena en medio app.js sin enterarse de nada. Mira como termina ${nombre} en web/app.js -- si acaba en ',' o lleva un comentario detras de la '}', lo que hay que arreglar es el corte, no la prueba`);
  return trozo.join('\n');
}

const M = new Function(
  `${recortar('_enVuelo')}\n${recortar('_tomarBoton')}\n${recortar('conBoton')}\n` +
  `return {_tomarBoton, conBoton};`
)();

// Un boton de mentira, con lo justo que toca el codigo.
const boton = (texto = 'Guardar') => ({ disabled: false, textContent: texto, dataset: {} });

test('mientras se guarda, el boton queda apagado', async () => {
  const b = boton();
  let resolver;
  const enCurso = M.conBoton(b, () => new Promise(r => { resolver = r; }));
  assert.equal(b.disabled, true, 'tiene que apagarse en cuanto empieza');
  resolver();
  await enCurso;
  assert.equal(b.disabled, false, 'y volver a encenderse al terminar');
});

test('el segundo toque durante el guardado NO hace nada', async () => {
  const b = boton();
  let veces = 0, resolver;
  const trabajo = () => { veces++; return new Promise(r => { resolver = r; }); };
  const primera = M.conBoton(b, trabajo);
  await M.conBoton(b, trabajo);          // el doble toque
  assert.equal(veces, 1, 'el segundo toque no puede volver a guardar');
  resolver();
  await primera;
});

test('subir + guardar no suelta el boton a mitad de camino', async () => {
  // Es el caso real: primero se sube el archivo, DESPUES se guarda. Con un
  // simple disabled=true/false por peticion, el boton quedaba libre justo entre
  // las dos — y esa es la ventana en la que el segundo toque duplica.
  const b = boton();
  const soltarSubida = M._tomarBoton(b, 'Subiendo…');
  const soltarGuardado = M._tomarBoton(b);
  assert.equal(b.disabled, true);
  soltarSubida();
  assert.equal(b.disabled, true, 'sigue apagado: aun queda el guardado');
  soltarGuardado();
  assert.equal(b.disabled, false);
});

test('el boton dice lo que esta haciendo y luego vuelve a lo suyo', async () => {
  const b = boton('Guardar');
  const soltar = M._tomarBoton(b, 'Subiendo…');
  assert.equal(b.textContent, 'Subiendo…');
  soltar();
  assert.equal(b.textContent, 'Guardar', 'tiene que recuperar su texto');
  assert.equal(b.dataset.textoOriginal, undefined, 'y no dejar rastro');
});

test('sin boton (llamada desde un temporizador o el SSE) no revienta', async () => {
  assert.equal(await M.conBoton(null, async () => 'ok'), 'ok');
  M._tomarBoton(null)();   // no lanza
});

test('si la accion falla, el boton se vuelve a encender igual', async () => {
  const b = boton();
  await assert.rejects(() => M.conBoton(b, async () => { throw new Error('sin conexión'); }));
  assert.equal(b.disabled, false, 'un fallo no puede dejar el boton muerto para siempre');
});

// --- que ademas se VEA ---
test('el CSS apaga de verdad los botones deshabilitados', () => {
  assert.match(css, /\.btn:disabled[^{]*\{[^}]*opacity/,
    'sin regla :disabled el navegador no apaga un .btn, que trae su propio fondo');
  assert.match(css, /\.btn:disabled[^{]*\{[^}]*cursor:\s*progress/,
    'el cursor tiene que decir que esta trabajando');
  // Y que el :hover no siga reaccionando: un boton apagado que se ilumina al
  // pasar el dedo dice lo contrario de lo que quiere decir.
  assert.match(css, /\.btn:disabled:hover/, 'hay que anular el :hover del boton apagado');
  assert.doesNotMatch(css, /:disabled:hover\{[^}]*inherit/,
    'inherit tomaria el color del contenedor, no el del boton');
});

// --- y que los seis que suben archivo esten cubiertos ---
test('los manejadores que suben archivo avisan de que estan subiendo', () => {
  for (const fn of ['guardarMaterialMus', 'guardarMaterial', 'guardarRecursoGrupo',
                    'guardarRecPredica', 'guardarPerfilDirectorio']) {
    const cuerpo = recortar(fn);
    assert.match(cuerpo, /conBoton\(/, `${fn} sube un archivo y no bloquea el boton`);
    assert.match(cuerpo, /Subiendo/, `${fn} tiene que decir que esta subiendo`);
  }
});

test('api() bloquea el boton en las peticiones que escriben, no en las lecturas', () => {
  const cuerpo = recortar('api');
  assert.match(cuerpo, /POST\|PATCH\|PUT\|DELETE/,
    'solo se bloquea al escribir: una lectura no duplica nada y apagar botones al leer molesta');
  assert.match(cuerpo, /_tomarBoton\(botonActual\(\)\)/);
  assert.match(cuerpo, /finally\s*\{\s*if\(soltar\)/,
    'el boton tiene que soltarse al FINAL de api(), no en cuanto responde la red');
});
