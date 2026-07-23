import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  SigningExperience,
  SigningSessionView,
  SignatureSubmission
} from '../components/SigningExperience';
import { api } from '../services/api';

export function LocalSigning() {
  const { token = '' } = useParams();
  const [session, setSession] = useState<SigningSessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get<SigningSessionView>(`/local-signatures/${encodeURIComponent(token)}`)
      .then(({ data }) => setSession(data))
      .catch(() => setLoadError('Este link local não existe ou não está mais disponível.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <SigningExperience
      session={session}
      loading={loading}
      unavailableMessage={loadError || undefined}
      local
      onComplete={async (submission: SignatureSubmission) => {
        try {
          const { data } = await api.post<SigningSessionView>(
            `/local-signatures/${encodeURIComponent(token)}/complete`,
            submission
          );
          setSession(data);
        } catch (requestError) {
          const message = (requestError as { response?: { data?: { message?: string } } })?.response?.data?.message;
          throw new Error(message || 'Não foi possível concluir a assinatura local.');
        }
      }}
    />
  );
}
