export function formatDate(value?: string) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    DRAFT: 'Rascunho',
    READY: 'Pronto para enviar',
    SENT: 'Enviado',
    VIEWED: 'Visualizado',
    IN_PROGRESS: 'Em assinatura',
    SIGNED: 'Assinado',
    FINISHED: 'Finalizado',
    DECLINED: 'Recusado',
    ERROR: 'Erro',
    CANCELED: 'Cancelado',
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
    SCHEDULED: 'Agendado',
    SENDING: 'Enviando',
    FAILED: 'Falhou',
    SKIPPED: 'Ignorado',
    ACCEPTED: 'Aceito',
    UNKNOWN: 'Desconhecido',
    BITRIX_INVITE_ACCEPTED: 'Aceite Bitrix24',
    MANUAL: 'Manual',
    RETRY: 'Retentativa',
    NOT_REQUIRED: 'Não necessário',
    ARCHIVED: 'Arquivado'
  };
  return labels[status || ''] || status || '-';
}
