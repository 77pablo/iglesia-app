// ============================================================
//  El limitador general cuenta por PERSONA cuando hay sesion, y por IP solo
//  cuando no la hay. Sin esto, toda la congregacion conectada al wifi del
//  templo comparte una sola cuota (misma IP publica) y se bloquean entre si.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';                       // fija DB_PATH y JWT_SECRET antes de cargar auth.js
import { signToken } from '../src/auth.js';
import { claveLimitador } from '../src/seguridad.js';

// req minimo con lo que mira el limitador.
const pedir = (token, ip = '190.44.10.7') => ({
  ip,
  headers: token ? { authorization: 'Bearer ' + token } : {}
});

test('con sesion, la clave es la persona: dos personas tras la misma IP no comparten cuota', () => {
  const ana = signToken({ id: 7, iglesia_id: 1 });
  const luis = signToken({ id: 8, iglesia_id: 1 });

  const claveAna = claveLimitador(pedir(ana));
  const claveLuis = claveLimitador(pedir(luis));

  assert.notEqual(claveAna, claveLuis, 'dos personas distintas no pueden caer en el mismo cubo');
  assert.match(claveAna, /7/, 'la clave debe identificar a la persona');
  // La misma persona desde otra IP (datos moviles, otra red) sigue siendo el mismo cubo.
  assert.equal(claveLimitador(pedir(ana, '2.2.2.2')), claveAna);
});

test('sin sesion, la clave sigue siendo la IP', () => {
  const anonima = claveLimitador(pedir(null, '190.44.10.7'));
  const otraIp = claveLimitador(pedir(null, '8.8.8.8'));
  assert.notEqual(anonima, otraIp, 'el trafico anonimo se sigue contando por IP');
  assert.equal(claveLimitador(pedir(null, '190.44.10.7')), anonima);
});

test('un token invalido NO regala cuota nueva: cuenta como anonimo (por IP)', () => {
  const porIp = claveLimitador(pedir(null, '190.44.10.7'));
  // Token con firma falsa: si se aceptara sin verificar, bastaria inventar
  // persona_id distintos para saltarse el limite entero.
  const forjado = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwZXJzb25hX2lkIjo5OTk5LCJpZ2xlc2lhX2lkIjoxfQ.firma-falsa';
  assert.equal(claveLimitador(pedir(forjado, '190.44.10.7')), porIp);
  // Y basura que ni siquiera parece un JWT.
  assert.equal(claveLimitador(pedir('no-es-un-token', '190.44.10.7')), porIp);
});

test('IPv6 se normaliza: la clave anonima no cambia por el sufijo del host', () => {
  // express-rate-limit agrupa IPv6 por prefijo /56; sin esa normalizacion, un
  // mismo cliente cambiando de sufijo tendria cuota infinita.
  const a = claveLimitador(pedir(null, '2001:db8:abcd:0012:1111:2222:3333:4444'));
  const b = claveLimitador(pedir(null, '2001:db8:abcd:0012:9999:8888:7777:6666'));
  assert.equal(a, b, 'el mismo prefijo IPv6 debe compartir cuota');
});
