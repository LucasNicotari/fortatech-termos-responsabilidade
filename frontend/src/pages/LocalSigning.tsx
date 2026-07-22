import { PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, PenLine } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

interface SigningSession {
  token: string;
  employeeName: string;
  documentName: string;
  status: string;
  finished: boolean;
  previewUrl: string;
}

export function LocalSigning() {
  const { token = '' } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [session, setSession] = useState<SigningSession | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<SigningSession>(`/local-signatures/${encodeURIComponent(token)}`)
      .then(({ data }) => setSession(data))
      .catch(() => setError('Este link de assinatura local nao existe ou nao esta mais disponivel.'))
      .finally(() => setLoading(false));
  }, [token]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const position = point(event);
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current!.getContext('2d')!;
    const position = point(event);
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#202b38';
    context.lineTo(position.x, position.y);
    context.stroke();
    setDrawn(true);
  }

  function stop(event: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
  }

  async function complete() {
    if (!canvasRef.current || !drawn || !accepted) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post<SigningSession>(
        `/local-signatures/${encodeURIComponent(token)}/complete`,
        { signatureDataUrl: canvasRef.current.toDataURL('image/png') }
      );
      setSession(data);
    } catch {
      setError('Nao foi possivel concluir a assinatura. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage title="Abrindo documento..." />;
  if (error && !session) return <CenteredMessage title="Link indisponivel" message={error} />;
  if (!session) return null;
  if (session.finished) return (
    <CenteredMessage
      icon={<CheckCircle2 className="text-b24-green" size={44} />}
      title="Assinatura concluida"
      message="Obrigado. O termo foi assinado e arquivado com seguranca no ambiente local."
    />
  );

  return (
    <main className="min-h-screen bg-b24-bg px-3 py-4 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-b24-border bg-white shadow-sm">
        <header className="border-b border-b24-border px-4 py-4 sm:px-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-b24-blue">FortaDocs · assinatura local</div>
          <h1 className="text-xl font-semibold text-ink">Termo de Responsabilidade</h1>
          <p className="mt-1 text-sm text-steel">Olá, {session.employeeName}. Revise o documento e assine no campo abaixo.</p>
        </header>

        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="border-b border-b24-border bg-zinc-100 p-3 lg:border-b-0 lg:border-r">
            <iframe title={session.documentName} src={session.previewUrl} className="h-[52vh] min-h-[420px] w-full rounded border border-b24-border bg-white" />
          </section>
          <section className="p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-ink">
              <PenLine size={20} className="text-b24-blue" />
              <h2 className="font-semibold">Faça sua assinatura</h2>
            </div>
            <p className="mb-3 text-sm text-steel">Use o mouse, touchpad ou o dedo. Faça a assinatura como faria em papel.</p>
            <canvas
              ref={canvasRef}
              width={900}
              height={260}
              aria-label="Campo para desenhar a assinatura"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
              className="h-40 w-full touch-none rounded border-2 border-dashed border-b24-border bg-white cursor-crosshair"
            />
            <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-steel hover:text-ink">
              <Eraser size={16} /> Limpar assinatura
            </button>

            <label className="mt-5 flex items-start gap-2.5 text-sm text-steel">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-b24-blue" />
              <span>Li o Termo de Responsabilidade e confirmo que esta assinatura foi feita por mim.</span>
            </label>
            {error && <p className="mt-3 text-sm text-coral">{error}</p>}
            <button
              type="button"
              disabled={!drawn || !accepted || submitting}
              onClick={complete}
              className="focus-ring mt-5 w-full rounded bg-b24-blue px-4 py-3 font-semibold text-white transition hover:bg-b24-blue-dark disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? 'Concluindo...' : 'Concluir assinatura'}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500">Teste local: nenhum e-mail ou documento real será enviado.</p>
          </section>
        </div>
      </div>
    </main>
  );
}

function CenteredMessage({ title, message, icon }: { title: string; message?: string; icon?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-b24-bg p-5">
      <div className="w-full max-w-md rounded-lg border border-b24-border bg-white p-8 text-center shadow-sm">
        {icon && <div className="mb-3 flex justify-center">{icon}</div>}
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {message && <p className="mt-2 text-sm text-steel">{message}</p>}
      </div>
    </main>
  );
}
