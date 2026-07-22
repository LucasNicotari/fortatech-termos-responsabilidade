import { spawn } from 'node:child_process';

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`docker terminou com codigo ${code}`)));
  });
}

async function main() {
  console.log('[limpeza] Removendo apenas cache de build e imagens sem uso.');
  console.log('[limpeza] Banco PostgreSQL, PDFs e containers ativos serao preservados.');
  await run(['builder', 'prune', '--all', '--force']);
  await run(['image', 'prune', '--all', '--force']);
  console.log('[limpeza] Espaco atual:');
  await run(['system', 'df']);
}

main().catch((error) => {
  console.error(`[limpeza] Falha: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
