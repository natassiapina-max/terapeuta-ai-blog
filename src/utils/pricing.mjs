// Same simplified model explained in /artigos/como-precificar-atendimentos/.
// Monthly remuneration must not be counted twice in fixed expenses.
export function sessionPrice({ fixed, pay, reserve, sessions, variable, percent }) {
  const values = [fixed, pay, reserve, sessions, variable, percent];
  if (values.some(value => !Number.isFinite(value) || value < 0) || sessions <= 0 || percent >= 100) {
    throw new RangeError('Informe valores não negativos, sessões maiores que zero e percentual inferior a 100%.');
  }
  const monthly = fixed + pay + reserve;
  const perSession = monthly / sessions + variable;
  const price = perSession / (1 - percent / 100);
  if (!Number.isFinite(price)) throw new RangeError('Os valores informados excedem o limite do cálculo.');
  return { monthly, price };
}
