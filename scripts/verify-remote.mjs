const backend = process.env.FORTADOCS_BACKEND_URL || 'https://fortatech-termos-api-hml.onrender.com';
const frontend = process.env.FORTADOCS_FRONTEND_URL || 'https://fortatech-termos-web-hml.onrender.com';
const portal = 'https://fortaeqt.bitrix24.com.br';

async function fetchWithTimeout(url, options = {}, timeout = 90_000) {
  return fetch(url, { ...options, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  process.stdout.write('[remote] Acordando e validando o backend...\n');
  const healthResponse = await fetchWithTimeout(`${backend}/health`);
  assert(healthResponse.ok, `/health retornou HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.status === 'ok' && health.database === 'reachable', 'Backend ou banco nao esta saudavel');

  const docs = await fetchWithTimeout(`${backend}/docs`, {}, 30_000);
  assert(docs.ok, `/docs retornou HTTP ${docs.status}`);

  const protectedRoute = await fetchWithTimeout(`${backend}/signature-provider/status`, {}, 30_000);
  assert(protectedRoute.status === 401, `Rota protegida retornou ${protectedRoute.status}; esperado 401`);

  const invalidInstall = await fetchWithTimeout(`${backend}/integrations/bitrix/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  }, 30_000);
  assert(invalidInstall.status === 400, `Instalacao vazia retornou ${invalidInstall.status}; esperado 400`);

  process.stdout.write('[remote] Validando o frontend e as politicas do iframe...\n');
  const frontendResponse = await fetchWithTimeout(frontend, {}, 30_000);
  assert(frontendResponse.ok, `Frontend retornou HTTP ${frontendResponse.status}`);
  const csp = frontendResponse.headers.get('content-security-policy') || '';
  assert(csp.includes(`frame-ancestors ${portal}`), 'CSP nao restringe o iframe ao portal Forta Tech');
  assert(!csp.includes('*.bitrix24'), 'CSP ainda contem wildcard Bitrix24');

  const html = await frontendResponse.text();
  const assetPath = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/)?.[1]
    || html.match(/<script[^>]+src="([^"]+\.js)"[^>]+type="module"/)?.[1];
  assert(assetPath, 'Bundle JavaScript nao encontrado no HTML');
  const asset = await (await fetchWithTimeout(new URL(assetPath, frontend).toString(), {}, 30_000)).text();
  assert(asset.includes(backend), 'Frontend nao foi compilado com a URL do backend HML');

  process.stdout.write(`[remote] OK - revisao ${health.revision || 'desconhecida'}\n`);
  process.stdout.write(`[remote] Backend: ${backend}\n`);
  process.stdout.write(`[remote] Frontend: ${frontend}\n`);
}

main().catch((error) => {
  process.stderr.write(`[remote] FALHA: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
