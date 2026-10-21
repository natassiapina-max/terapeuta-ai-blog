import assert from 'node:assert/strict';
import { sessionPrice } from '../src/utils/pricing.mjs';
const base = { fixed:2000, pay:4000, reserve:400, sessions:80, variable:10, percent:10 };
assert.deepEqual(sessionPrice(base), {monthly:6400,price:100});
assert.equal(sessionPrice({...base,percent:0}).price,90);
assert.equal(sessionPrice({...base,sessions:40}).price,170/0.9);
for (const invalid of [{sessions:0},{percent:100},{fixed:-1},{pay:NaN},{reserve:Infinity}]) {
  assert.throws(() => sessionPrice({...base,...invalid}),RangeError);
}
console.log('Precificação: exemplo, cenários e entradas inválidas conferidos.');
