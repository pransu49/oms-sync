// refund-accounts.js — every Amazon account the refund robots work with (owner 20 Nov 2026: "we have Finance access for all").
// Account names differ between tools ("Vishal E commerce" in OMS, "Vishal E-Commerce" elsewhere), so match by name, not exact spelling.
const LIST = [
  { key: 'sastastore', name: 'SASTA STORE', re: /sasta/i, env: 'SPAPI_REFRESH_TOKEN_SASTASTORE' },
  { key: 'praso', name: 'PRASO ENTERPRISES', re: /praso/i, env: 'SPAPI_REFRESH_TOKEN_PRASO' },
  { key: 'vishal', name: 'Vishal E commerce', re: /vishal/i, env: 'SPAPI_REFRESH_TOKEN_VISHAL' },
  { key: 'munda', name: 'E Commerce Munda', re: /munda/i, env: 'SPAPI_REFRESH_TOKEN_MUNDA' },
  { key: 'aikm', name: 'AIKM PHARMA PRIVATE LIMITED', re: /aikm/i, env: 'SPAPI_REFRESH_TOKEN_AIKM' },
];
// -> { key, name, token } for an account name, or null (unknown account / no key saved yet)
function accountOf(name) {
  const a = LIST.find((x) => x.re.test(String(name || '')));
  const token = a && String(process.env[a.env] || '').trim();
  return a && token ? { key: a.key, name: a.name, token } : null;
}
const connected = () => LIST.filter((a) => String(process.env[a.env] || '').trim()).map((a) => ({ key: a.key, name: a.name, token: process.env[a.env].trim() }));
module.exports = { LIST, accountOf, connected };
