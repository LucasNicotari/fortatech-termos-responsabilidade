import { spawn } from 'node:child_process';

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`docker terminou com codigo ${code}`)));
  });
}

async function main() {
  const full = process.argv.includes('--all');
  console.log(full
    ? '[limpeza] Modo completo: removendo todo cache de build e todas as imagens sem uso.'
    : '[limpeza] Modo seguro: removendo cache com mais de 24 horas e imagens intermediarias.');
  console.log('[limpeza] Banco PostgreSQL, PDFs e containers ativos serao preservados.');
  await run(full
    ? ['builder', 'prune', '--all', '--force']
    : ['builder', 'prune', '--force', '--filter', 'until=24h']);
  await run(full
    ? ['image', 'prune', '--all', '--force']
    : ['image', 'prune', '--force']);
  console.log('[limpeza] Espaco atual:');
  await run(['system', 'df']);
}

main().catch((error) => {
  console.error(`[limpeza] Falha: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
