// Pide al sistema operativo un puerto libre y lo devuelve.
//
// Existe porque upload-validacion.test.js y seguridad.test.js fijaban 3941 y
// 3931 a mano: dos corridas a la vez se pisaban y el sintoma ("El servidor de
// pruebas no respondio a tiempo") no decia nada de la causa. Hueco anotado en
// ESTADO.md el 30-jul; mordio de verdad el 5-ago.
//
// Queda una ventana de carrera entre cerrar este socket y que el servidor hijo
// abra el suyo: se acepta, es ordenes de magnitud mas chica que el choque
// determinista de un numero fijo.
import net from 'node:net';

export function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const puerto = s.address().port;
      s.close(err => err ? reject(err) : resolve(puerto));
    });
  });
}
