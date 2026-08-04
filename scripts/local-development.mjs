import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const composeArgs = [
  'compose',
  '-f', 'docker-compose.yml',
  '-f', 'docker-compose.local.yml'
];

const localEnvironment = {
  ...process.env,
  LOCAL_DEVELOPMENT_MODE: 'true',
  VITE_LOCAL_DEVELOPMENT_MODE: 'true',
  PUBLIC_BACKEND_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
  VITE_API_URL: 'http://localhost:3000'
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: localEnvironment,
      shell: false,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} terminou com codigo ${code}`)));
  });
}

async function waitFor(url, label, attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return response;
    } catch {
      // O container pode ainda estar aplicando migrations ou iniciando o servidor.
    }
    if (attempt === attempts) throw new Error(`${label} nao respondeu em ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function request(path, options = {}) {
  const response = await fetch(`http://localhost:3000${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} retornou HTTP ${response.status}: ${body}`);
  }
  return response.json();
}

async function runEndToEnd(headers, employees) {
  const employee = employees.find((item) => item.ID === '9016') || employees.at(-1);
  if (!employee?.EMAIL || !employee.DEPARTMENT_NAME) {
    throw new Error('Colaborador sintetico incompleto para o teste ponta a ponta');
  }
  const name = [employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ');
  const draft = await request('/send-requests', {
    method: 'POST', headers,
    body: JSON.stringify({
      employeeBitrixUserId: Number(employee.ID),
      employeeEmail: employee.EMAIL,
      employeeName: name,
      cpf: '168.995.350-09',
      departamento: employee.DEPARTMENT_NAME,
      equipment: [
        {
          quantity: 1,
          description: 'Notebook de teste local',
          serialNumber: `LOCAL-${Date.now()}`,
          assetTag: 'HML-LOCAL-001',
          accessories: 'Carregador e mochila'
        },
        { quantity: 1, description: 'Mouse de teste local', assetTag: 'HML-LOCAL-002' }
      ]
    })
  });
  const [preview, parallelPreview] = await Promise.all([
    request(`/send-requests/${draft.id}/preview`, { method: 'POST', headers, body: '{}' }),
    request(`/send-requests/${draft.id}/preview`, { method: 'POST', headers, body: '{}' })
  ]);
  if (!parallelPreview.previewUrl) {
    throw new Error('A conversao paralela com perfil isolado do LibreOffice falhou');
  }
  const previewResponse = await fetch(preview.previewUrl, { signal: AbortSignal.timeout(20_000) });
  const previewPdf = Buffer.from(await previewResponse.arrayBuffer());
  if (!previewResponse.ok || previewPdf.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('A previa local nao retornou um PDF valido');
  }
  const sent = await request(`/send-requests/${draft.id}/send`, { method: 'POST', headers, body: '{}' });
  const signature = sent.signatures?.[0];
  if (!signature?.id || !signature.providerDocumentId) {
    throw new Error('O envio local nao criou o link de assinatura do colaborador');
  }
  const signingSession = await request(`/local-signatures/${encodeURIComponent(signature.providerDocumentId)}`);
  if (signingSession.finished || !signingSession.previewUrl) {
    throw new Error('O link local do colaborador nao esta disponivel para assinatura');
  }
  const sampleSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const completed = await request(`/local-signatures/${encodeURIComponent(signature.providerDocumentId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({ method: 'DRAWN', accepted: true, signatureDataUrl: sampleSignature })
  });
  if (!completed.finished) throw new Error('A assinatura manuscrita local nao foi concluida');
  const finished = await request(`/signatures/${signature.id}`, { headers });
  const file = await request(`/signatures/${signature.id}/file`, { headers });
  const signedResponse = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
  const signedPdf = Buffer.from(await signedResponse.arrayBuffer());
  const downloadedSha256 = createHash('sha256').update(signedPdf).digest('hex');
  if (!signedResponse.ok || finished.archiveStatus !== 'ARCHIVED'
    || downloadedSha256 !== finished.signedSha256) {
    throw new Error('O PDF assinado local nao foi arquivado com o SHA-256 esperado');
  }
  const removed = await request(`/send-requests/${draft.id}`, {
    method: 'DELETE',
    headers
  });
  const visibleRequests = await request('/send-requests', { headers });
  const preservedFile = await request(`/signatures/${signature.id}/file`, { headers });
  if (!removed.removed
    || visibleRequests.some((item) => item.id === draft.id)
    || !preservedFile.url) {
    throw new Error('A remocao controlada do historico nao preservou o documento assinado');
  }
  return { requestId: draft.id, signatureId: signature.id, bytes: signedPdf.length, sha256: downloadedSha256 };
}

async function runFiveTermSend(headers, employees) {
  const selected = employees.filter((item) => item.EMAIL && item.DEPARTMENT_NAME).slice(0, 5);
  if (selected.length !== 5) throw new Error('Sao necessarios 5 colaboradores sinteticos para validar o envio conjunto');
  const createdIds = [];
  const signatureTokens = new Set();
  try {
    for (const [index, employee] of selected.entries()) {
      const draft = await request('/send-requests', {
        method: 'POST', headers,
        body: JSON.stringify({
          employeeBitrixUserId: Number(employee.ID),
          employeeEmail: employee.EMAIL,
          employeeName: [employee.NAME, employee.LAST_NAME].filter(Boolean).join(' '),
          cpf: validCpf(100_000_000 + index),
          departamento: employee.DEPARTMENT_NAME,
          equipment: [{
            quantity: 1,
            description: `Notebook do envio conjunto ${index + 1}`,
            serialNumber: `MULTI-${Date.now()}-${index + 1}`,
            assetTag: `HML-MULTI-00${index + 1}`
          }]
        })
      });
      createdIds.push(draft.id);
      const preview = await request(`/send-requests/${draft.id}/preview`, {
        method: 'POST', headers, body: '{}'
      });
      if (!preview.previewUrl) throw new Error(`O termo ${index + 1} nao gerou previa`);
      const sent = await request(`/send-requests/${draft.id}/send`, {
        method: 'POST', headers, body: '{}'
      });
      const signature = sent.signatures?.[0];
      if (sent.status !== 'SENT' || !signature?.providerDocumentId) {
        throw new Error(`O termo ${index + 1} nao foi enviado de forma independente`);
      }
      signatureTokens.add(signature.providerDocumentId);
    }
    if (signatureTokens.size !== 5) {
      throw new Error('O envio conjunto reutilizou indevidamente uma assinatura entre colaboradores');
    }
    return { sent: createdIds.length, independentSignatures: signatureTokens.size };
  } finally {
    for (const id of createdIds) {
      await request(`/send-requests/${id}`, { method: 'DELETE', headers });
    }
  }
}

function validCpf(base) {
  const digits = String(base).padStart(9, '0').slice(-9).split('').map(Number);
  const checkDigit = (values) => {
    const sum = values.reduce((total, value, index) => total + value * (values.length + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  digits.push(checkDigit(digits));
  digits.push(checkDigit(digits));
  const value = digits.join('');
  return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
}

async function main() {
  console.log('[local] Iniciando banco, backend e frontend locais...');
  const buildArgs = process.argv.includes('--build') ? ['--build'] : [];
  await run('docker', [...composeArgs, 'up', ...buildArgs, '-d']);

  console.log('[local] Aguardando os servicos e validando o login automatico...');
  await waitFor('http://localhost:3000/health', 'Backend');
  const frontendResponse = await waitFor('http://localhost:5173', 'Frontend');
  const frontendCsp = frontendResponse.headers.get('content-security-policy') || '';
  if (!frontendCsp.includes('http://localhost:3000')) {
    throw new Error('A politica de seguranca do frontend bloqueia a API local');
  }

  const session = await request('/auth/local', { method: 'POST', body: '{}' });
  if (!session.accessToken) throw new Error('O login local nao retornou um token');
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const [, employees, provider] = await Promise.all([
    request('/auth/me', { headers }),
    request('/bitrix/term-employees', { headers }),
    request('/signature-provider/status', { headers })
  ]);
  if (!Array.isArray(employees) || employees.length === 0) {
    throw new Error('A lista local de colaboradores esta vazia');
  }
  if (!provider.local || !provider.configured) {
    throw new Error('O simulador local de assinatura nao foi habilitado');
  }

  let endToEnd;
  let fiveTermSend;
  if (process.argv.includes('--check')) {
    console.log('[local] Executando termo, previa, envio, assinatura e download sinteticos...');
    endToEnd = await runEndToEnd(headers, employees);
    console.log('[local] Executando envio conjunto de 5 termos independentes...');
    fiveTermSend = await runFiveTermSend(headers, employees);
  }

  console.log('');
  console.log('[local] Ambiente pronto e validado.');
  console.log(`[local] Usuario automatico: ${session.user.name}`);
  console.log(`[local] Colaboradores sinteticos: ${employees.length}`);
  console.log('[local] Aplicacao: http://localhost:5173');
  console.log('[local] API: http://localhost:3000/docs');
  console.log('[local] Nenhum e-mail ou notificacao real sera enviado.');
  if (endToEnd) {
    console.log(`[local] Ponta a ponta aprovado: ${endToEnd.bytes} bytes, SHA-256 ${endToEnd.sha256}`);
  }
  if (fiveTermSend) {
    console.log(`[local] Envio conjunto aprovado: ${fiveTermSend.sent} termos e ${fiveTermSend.independentSignatures} assinaturas independentes`);
  }
  console.log('[local] Para encerrar: npm.cmd run local:down');
}

main().catch((error) => {
  console.error(`[local] Falha: ${error instanceof Error ? error.message : error}`);
  console.error('[local] Consulte os logs com: npm.cmd run local:logs');
  process.exitCode = 1;
});
