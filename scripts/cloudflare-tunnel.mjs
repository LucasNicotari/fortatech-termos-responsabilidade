import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerCli = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const composeFiles = ['-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml'];
const checkOnly = process.argv.includes('--check');
const tunnelProcesses = [];
let shuttingDown = false;
let publicConfigurationApplied = false;

function log(message = '') {
  process.stdout.write(`[tunnel-test] ${message}\n`);
}

function command(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true
    });
    let output = '';
    if (options.capture) {
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${commandName} terminou com codigo ${code}${output ? `\n${output}` : ''}`));
    });
  });
}

async function waitForHttp(url, expectedStatus = 200, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (response.status === expectedStatus) return response;
      lastError = new Error(`${url} respondeu HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timeout ao aguardar ${url}: ${lastError?.message || 'sem resposta'}`);
}

function startQuickTunnel(origin, label) {
  const child = spawn(process.execPath, [wranglerCli, 'tunnel', 'quick-start', origin], {
    cwd: root,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false'
    },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true
  });
  tunnelProcesses.push(child);

  let settled = false;
  const urlPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) reject(new Error(`O tunel ${label} nao informou uma URL em 120 segundos`));
    }, 120_000);
    const consume = (chunk) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/).filter(Boolean)) log(`${label}: ${line}`);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`O tunel ${label} encerrou antes de iniciar (codigo ${code})`));
      else if (!shuttingDown) {
        log(`O tunel ${label} encerrou inesperadamente (codigo ${code}); finalizando o teste.`);
        void shutdown(1);
      }
    });
  });
  return urlPromise;
}

function composeEnvironment(backendUrl, frontendUrl) {
  return {
    PUBLIC_BACKEND_URL: backendUrl,
    FRONTEND_URL: frontendUrl,
    CORS_ORIGINS: `${frontendUrl},http://localhost:5173`,
    VITE_API_URL: backendUrl
  };
}

async function applyComposeConfiguration(environment, build) {
  const args = ['compose', ...composeFiles, 'up'];
  if (build) args.push('--build');
  args.push('-d');
  await command('docker', args, { env: environment });
}

async function verifyPublicEndpoints(backendUrl, frontendUrl) {
  log('Validando os endpoints HTTPS publicos...');
  const health = await waitForHttp(`${backendUrl}/health`);
  const healthBody = await health.json();
  if (healthBody.status !== 'ok') throw new Error('O /health nao retornou status ok');

  await waitForHttp(`${backendUrl}/docs`);
  const frontend = await waitForHttp(frontendUrl);
  const csp = frontend.headers.get('content-security-policy') || '';
  if (!csp.includes('frame-ancestors')) throw new Error('O frontend nao retornou a protecao frame-ancestors');

  const protectedResponse = await fetch(`${backendUrl}/integrations/bitrix/config`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (protectedResponse.status !== 401) {
    throw new Error(`Rota protegida respondeu ${protectedResponse.status}; esperado 401 sem JWT`);
  }

  const invalidInstall = await fetch(`${backendUrl}/integrations/bitrix/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15_000)
  });
  if (invalidInstall.status !== 400) {
    throw new Error(`Instalacao sem payload respondeu ${invalidInstall.status}; esperado 400`);
  }

  const html = await frontend.text();
  const assetPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!assetPath) throw new Error('Nao foi possivel localizar o JavaScript compilado do frontend');
  const assetUrl = new URL(assetPath, frontendUrl).toString();
  const asset = await (await waitForHttp(assetUrl)).text();
  if (!asset.includes(backendUrl)) {
    throw new Error('O frontend publicado nao foi compilado com a URL do backend do tunel');
  }

  return {
    health: '200 / status ok',
    docs: '200',
    frontend: '200 / CSP presente / API publica incorporada',
    protectedRoute: '401 sem JWT',
    invalidInstall: '400 sem payload Bitrix'
  };
}

function writeReport(report) {
  const artifacts = path.join(root, '.artifacts');
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(path.join(artifacts, 'cloudflare-tunnel.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function inspectBitrixCredentials() {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return false;
  const contents = readFileSync(envPath, 'utf8');
  return ['BITRIX_CLIENT_ID', 'BITRIX_CLIENT_SECRET'].every((name) => {
    const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'));
    const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    return value && value !== 'PENDING_CONFIGURATION';
  });
}

async function stopTunnels() {
  for (const child of tunnelProcesses) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function restoreLocalConfiguration() {
  if (!publicConfigurationApplied) return;
  log('Restaurando as URLs localhost nos containers...');
  await applyComposeConfiguration({
    PUBLIC_BACKEND_URL: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    VITE_API_URL: 'http://localhost:3000'
  }, true);
  await waitForHttp('http://localhost:3000/health');
  await waitForHttp('http://localhost:5173');
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopTunnels();
  try {
    await restoreLocalConfiguration();
  } catch (error) {
    log(`Aviso: nao foi possivel restaurar automaticamente o modo localhost: ${error.message}`);
    exitCode = exitCode || 1;
  }
  process.exit(exitCode);
}

async function main() {
  if (!existsSync(wranglerCli)) {
    throw new Error('Wrangler nao instalado. Execute npm.cmd install na raiz do projeto.');
  }

  log('Iniciando/verificando a pilha Docker local...');
  await applyComposeConfiguration({
    PUBLIC_BACKEND_URL: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    VITE_API_URL: 'http://localhost:3000'
  }, false);
  await waitForHttp('http://localhost:3000/health');
  await waitForHttp('http://localhost:5173');

  log('Criando dois Quick Tunnels: API e interface web...');
  // A primeira execucao do Wrangler baixa cloudflared. No Windows, iniciar os dois
  // processos ao mesmo tempo pode faze-los disputar o mesmo arquivo temporario.
  const backendUrl = await startQuickTunnel('http://localhost:3000', 'backend');
  const frontendUrl = await startQuickTunnel('http://localhost:5173', 'frontend');

  log('Recompilando o frontend e recriando os containers com as URLs HTTPS temporarias...');
  await applyComposeConfiguration(composeEnvironment(backendUrl, frontendUrl), true);
  publicConfigurationApplied = true;
  await waitForHttp('http://localhost:3000/health');
  await waitForHttp('http://localhost:5173');

  const checks = await verifyPublicEndpoints(backendUrl, frontendUrl);
  const report = {
    generatedAt: new Date().toISOString(),
    temporary: true,
    backendUrl,
    frontendUrl,
    bitrixApplicationUrl: `${backendUrl}/integrations/bitrix/launch`,
    bitrixInstallationUrl: `${backendUrl}/integrations/bitrix/install`,
    checks,
    bitrixCredentialsPresent: inspectBitrixCredentials()
  };
  writeReport(report);

  log('Todos os testes tecnicos passaram.');
  log(`Frontend: ${frontendUrl}`);
  log(`URL da aplicacao Bitrix: ${report.bitrixApplicationUrl}`);
  log(`URL de instalacao Bitrix: ${report.bitrixInstallationUrl}`);
  log(`Relatorio: ${path.join('.artifacts', 'cloudflare-tunnel.json')}`);
  if (!report.bitrixCredentialsPresent) {
    log('Aviso: BITRIX_CLIENT_ID/SECRET ainda nao estao preenchidos; a instalacao real nao funcionara ate isso ser feito.');
  }

  if (checkOnly) {
    log('Modo --check concluido; encerrando tuneis e restaurando localhost.');
    await shutdown(0);
    return;
  }

  log('Mantenha este terminal aberto durante os testes. Pressione Ctrl+C para encerrar e restaurar localhost.');
  await new Promise(() => {});
}

process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });

main().catch(async (error) => {
  log(`ERRO: ${error instanceof Error ? error.message : String(error)}`);
  await shutdown(1);
});
