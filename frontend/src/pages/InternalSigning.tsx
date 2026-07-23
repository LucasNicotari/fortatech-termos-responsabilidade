import { useQuery } from '@tanstack/react-query';
import {
  SigningExperience,
  SigningSessionView,
  SignatureSubmission
} from '../components/SigningExperience';
import { api } from '../services/api';

export function InternalSigning() {
  const sessionQuery = useQuery({
    queryKey: ['signing-session'],
    queryFn: async () => (await api.get<SigningSessionView>('/signing/session')).data,
    retry: false
  });

  return (
    <SigningExperience
      session={sessionQuery.data}
      loading={sessionQuery.isLoading}
      unavailableMessage={sessionQuery.isError
        ? 'O convite expirou, já foi revogado ou não pertence ao usuário conectado.'
        : undefined}
      onComplete={async (submission: SignatureSubmission) => {
        try {
          await api.post('/signing/complete', submission);
          await sessionQuery.refetch();
        } catch (requestError) {
          throw new Error(requestMessage(requestError, 'Não foi possível concluir a assinatura.'));
        }
      }}
    />
  );
}

function requestMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    || (error instanceof Error ? error.message : fallback);
}
