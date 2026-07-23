import { ChangeEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eraser, ImageUp, Keyboard, PenLine } from 'lucide-react';
import { FortaTechMark } from './FortaTechMark';

export type SignatureMethod = 'TYPED' | 'DRAWN' | 'UPLOADED';

export interface SigningSessionView {
  employeeName: string;
  documentName: string;
  status: string;
  finished: boolean;
  previewUrl: string;
  downloadUrl?: string | null;
}

export interface SignatureSubmission {
  method: SignatureMethod;
  typedName?: string;
  accepted: boolean;
  signatureDataUrl: string;
}

interface SigningExperienceProps {
  session?: SigningSessionView | null;
  loading?: boolean;
  unavailableMessage?: string;
  local?: boolean;
  onComplete: (submission: SignatureSubmission) => Promise<void>;
}

export function SigningExperience({
  session,
  loading = false,
  unavailableMessage,
  local = false,
  onComplete
}: SigningExperienceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [method, setMethod] = useState<SignatureMethod>('DRAWN');
  const [typedName, setTypedName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!typedName && session?.employeeName) setTypedName(session.employeeName);
  }, [session?.employeeName, typedName]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (method !== 'DRAWN') return;
    const canvas = canvasRef.current!;
    const position = point(event);
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = canvas.getContext('2d')!;
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || method !== 'DRAWN') return;
    const context = canvasRef.current!.getContext('2d')!;
    const position = point(event);
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#263238';
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasSignature(true);
  }

  function stop(event: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setError('');
  }

  function selectMethod(next: SignatureMethod) {
    setMethod(next);
    clear();
    if (next === 'TYPED') renderTypedSignature(typedName);
  }

  function renderTypedSignature(value: string) {
    setTypedName(value);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const name = value.trim();
    if (!name) {
      setHasSignature(false);
      return;
    }
    context.fillStyle = '#263238';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'italic 62px cursive';
    context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 70);
    setHasSignature(true);
  }

  function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1_000_000) {
      setError('Escolha uma imagem PNG ou JPG de até 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min((canvas.width - 60) / image.width, (canvas.height - 40) / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        setHasSignature(true);
        setError('');
      };
      image.onerror = () => setError('Não foi possível ler essa imagem.');
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function complete() {
    const canvas = canvasRef.current;
    if (!canvas || !accepted || !hasSignature) return;
    setSubmitting(true);
    setError('');
    try {
      await onComplete({
        method,
        typedName: method === 'TYPED' ? typedName.trim() : undefined,
        accepted,
        signatureDataUrl: canvas.toDataURL('image/png')
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível concluir a assinatura.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage title="Abrindo seu termo..." />;
  if (unavailableMessage || !session) {
    return <CenteredMessage title="Termo indisponível" message={unavailableMessage || 'Não foi possível abrir este termo.'} />;
  }
  if (session.finished) {
    return (
      <CenteredMessage
        icon={<CheckCircle2 className="text-b24-green" size={46} />}
        title="Assinatura concluída"
        message={local
          ? 'O teste foi concluído e o PDF ficou arquivado somente no ambiente local.'
          : 'O Termo de Responsabilidade foi assinado e arquivado. Os responsáveis selecionados foram notificados.'}
        action={session.downloadUrl
          ? <a href={session.downloadUrl} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-b24-blue px-4 py-2.5 text-sm font-semibold text-white"><Download size={17} /> Baixar documento assinado</a>
          : undefined}
      />
    );
  }

  return (
    <main className="min-h-screen bg-b24-bg p-2 sm:p-4">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-xl border border-b24-border bg-white shadow-sm">
        <header className="flex items-center gap-3 border-t-[3px] border-t-b24-blue px-4 py-3 sm:px-5">
          <FortaTechMark className="h-9 w-9" />
          <div className="min-w-0">
            <p className="font-extrabold leading-none tracking-tight"><span className="text-[#ed1c24]">Forta</span><span className="text-ink">Docs</span></p>
            <p className="mt-1 truncate text-xs text-steel">{local ? 'Simulação local da assinatura' : 'Assinatura de Termo de Responsabilidade'}</p>
          </div>
        </header>
        <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
          <section className="border-y border-b24-border bg-zinc-100 p-2.5 lg:border-b-0 lg:border-r">
            <iframe title={session.documentName} src={session.previewUrl} className="h-[56vh] min-h-[390px] w-full rounded border border-b24-border bg-white lg:h-[calc(100vh-105px)]" />
          </section>
          <section className="p-4 sm:p-5">
            <h1 className="text-lg font-semibold text-ink">Olá, {session.employeeName}</h1>
            <p className="mt-1 text-sm text-steel">Confira o documento e escolha como deseja assinar.</p>

            <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg bg-b24-bg p-1">
              <MethodButton active={method === 'DRAWN'} icon={PenLine} label="Desenhar" onClick={() => selectMethod('DRAWN')} />
              <MethodButton active={method === 'TYPED'} icon={Keyboard} label="Digitar" onClick={() => selectMethod('TYPED')} />
              <MethodButton active={method === 'UPLOADED'} icon={ImageUp} label="Imagem" onClick={() => selectMethod('UPLOADED')} />
            </div>

            {method === 'TYPED' && <label className="mt-4 grid gap-1.5 text-sm text-steel">Nome na assinatura<input value={typedName} maxLength={160} onChange={(event) => renderTypedSignature(event.target.value)} className="focus-ring rounded border border-b24-border px-3 py-2.5 text-ink" /></label>}
            {method === 'UPLOADED' && <label className="focus-ring mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-b24-blue bg-sky-50 px-3 py-3 text-sm font-semibold text-b24-blue-dark"><ImageUp size={17} /> Escolher PNG ou JPG<input type="file" accept="image/png,image/jpeg" onChange={uploadImage} className="sr-only" /></label>}

            <canvas
              ref={canvasRef}
              width={900}
              height={260}
              aria-label="Prévia da assinatura"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
              className={`mt-4 h-36 w-full rounded-lg border-2 border-dashed border-b24-border bg-white ${method === 'DRAWN' ? 'touch-none cursor-crosshair' : ''}`}
            />
            <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-steel hover:text-ink"><Eraser size={15} /> Limpar</button>

            <label className="mt-5 flex items-start gap-2.5 rounded-lg bg-b24-bg p-3 text-sm text-steel">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-b24-blue" />
              <span>Li e concordo com o Termo de Responsabilidade e confirmo que esta assinatura foi registrada por mim.</span>
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}
            <button type="button" disabled={!hasSignature || !accepted || submitting} onClick={complete} className="focus-ring mt-4 w-full rounded-lg bg-b24-blue px-4 py-3 font-semibold text-white hover:bg-b24-blue-dark disabled:cursor-not-allowed disabled:opacity-45">
              {submitting ? 'Finalizando...' : 'Assinar e finalizar'}
            </button>
            <p className="mt-3 text-center text-[11px] text-zinc-500">{local
              ? 'Teste local: nenhuma mensagem real será enviada ao Bitrix24.'
              : 'A assinatura ficará incorporada ao PDF com data, método e identificação do usuário Bitrix24.'}</p>
          </section>
        </div>
      </div>
    </main>
  );
}

function MethodButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof PenLine; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`focus-ring flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition ${active ? 'bg-white text-b24-blue-dark shadow-sm' : 'text-steel hover:text-ink'}`}><Icon size={15} /> <span>{label}</span></button>;
}

function CenteredMessage({ title, message, icon, action }: { title: string; message?: string; icon?: ReactNode; action?: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-b24-bg p-5"><div className="w-full max-w-md rounded-xl border border-b24-border bg-white p-8 text-center shadow-sm">{icon && <div className="mb-3 flex justify-center">{icon}</div>}<h1 className="text-xl font-semibold text-ink">{title}</h1>{message && <p className="mt-2 text-sm text-steel">{message}</p>}{action}</div></main>;
}
