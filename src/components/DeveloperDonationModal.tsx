import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Check, CheckCircle2, Copy, Heart, QrCode, X } from 'lucide-react';
import { buildPixPayload, formatBrlCurrency } from '../lib/pixPayload';
import { DonationConfig } from '../types/studio';

interface DeveloperDonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextLabel?: string;
  donation: DonationConfig;
}

type DonationStep = 'select' | 'qrcode' | 'thanks';

export const DeveloperDonationModal: React.FC<DeveloperDonationModalProps> = ({
  isOpen,
  onClose,
  contextLabel,
  donation,
}) => {
  const [step, setStep] = useState<DonationStep>('select');
  const [selectedAmount, setSelectedAmount] = useState<number>(0.99);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('9,90');
  const [customError, setCustomError] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setCustomMode(false);
    setCustomError(null);
    setCopiedPix(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const pixCode = useMemo(() => {
    return buildPixPayload({
      pixKey: donation.pixKey,
      amount: selectedAmount,
      recipientName: donation.recipientName,
      recipientCity: donation.recipientCity,
      txid: `ATELIER${Math.round(selectedAmount * 100)}`,
    });
  }, [donation.pixKey, donation.recipientName, donation.recipientCity, selectedAmount]);

  useEffect(() => {
    if (!isOpen || step !== 'qrcode' || !qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const size = 264;
    let cancelled = false;

    QRCode.toCanvas(
      canvas,
      pixCode,
      {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#08080A',
          light: '#FFFFFF',
        },
      },
      (err) => {
        if (err || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw centered Atelier Club brand emblem over high-ECC QR code
        const outerSize = 58;
        const innerSize = 50;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(cx - outerSize / 2, cy - outerSize / 2, outerSize, outerSize, 12);
        ctx.fill();

        ctx.fillStyle = '#08080A';
        ctx.beginPath();
        ctx.roundRect(cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, 10);
        ctx.fill();

        ctx.strokeStyle = '#F2B705';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#F2B705';
        ctx.font = '700 16px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('AC', cx, cy - 6);

        ctx.fillStyle = '#F4F4F5';
        ctx.font = '600 6.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('ATELIER CLUB', cx, cy + 12);
        ctx.restore();
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isOpen, step, pixCode]);

  if (!isOpen) return null;

  const handleSelectPreset = (amount: number) => {
    setCustomMode(false);
    setCustomError(null);
    setSelectedAmount(amount);
    setCopiedPix(false);
    setStep('qrcode');
  };

  const parseCustomAmount = (raw: string): number => {
    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const handleConfirmCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseCustomAmount(customInput);
    if (Number.isNaN(parsed) || parsed < 0.99) {
      setCustomError('O valor mínimo para doação é R$ 0,99.');
      return;
    }
    setCustomError(null);
    setSelectedAmount(Math.round(parsed * 100) / 100);
    setCopiedPix(false);
    setStep('qrcode');
  };

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2600);
    } catch {
      // Fallback copy if needed
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Apoiar o desenvolvimento do Atelier Club"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#111115] border border-zinc-800 shadow-2xl overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/90">
          <div className="flex items-center gap-2 text-xs text-[#F2B705] font-medium">
            <Heart className="w-4 h-4 fill-current" />
            <span>Apoio Opcional ao Desenvolvedor</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Fechar janela de apoio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: SELECT DONATION AMOUNT */}
        {step === 'select' && (
          <div className="p-6 space-y-5">
            {contextLabel && (
              <p className="text-xs text-emerald-400 font-medium">
                {contextLabel}
              </p>
            )}

            <div className="space-y-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-50 leading-tight">
                O Atelier Club é 100% gratuito
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Para ajudar a manter os servidores no ar e melhorar de forma substancial todo o conteúdo, novos modelos de IA e papéis de parede 4K, você pode fazer uma doação extra a partir de <strong className="text-zinc-100">R$ 0,99</strong>.
              </p>
              <p className="text-xs text-zinc-400">
                O aplicativo continua totalmente gratuito para você, doando ou não.
              </p>
            </div>

            {/* Preset & Custom Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectPreset(0.99)}
                className="rounded-xl bg-[#16161B] border border-zinc-700 hover:border-[#F2B705] p-3.5 text-left transition-colors group"
              >
                <p className="text-[11px] text-zinc-400">Apoio simbólico</p>
                <p className="font-mono text-lg font-bold text-zinc-50 group-hover:text-[#F2B705] mt-0.5 tabular-nums">
                  R$ 0,99
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset(4.99)}
                className="rounded-xl bg-[#16161B] border border-[#F2B705]/60 hover:border-[#F2B705] p-3.5 text-left transition-colors group"
              >
                <p className="text-[11px] text-[#F2B705]">Mais escolhido</p>
                <p className="font-mono text-lg font-bold text-zinc-50 group-hover:text-[#F2B705] mt-0.5 tabular-nums">
                  R$ 4,99
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCustomMode(true);
                  setCustomError(null);
                }}
                className={`rounded-xl border p-3.5 text-left transition-colors ${
                  customMode
                    ? 'bg-[#1A1A20] border-[#F2B705]'
                    : 'bg-[#16161B] border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <p className="text-[11px] text-zinc-400">Personalizado</p>
                <p className="text-sm font-semibold text-zinc-100 mt-1">
                  Definir valor
                </p>
              </button>
            </div>

            {customMode && (
              <form
                onSubmit={handleConfirmCustom}
                className="rounded-xl bg-[#0B0B0E] border border-zinc-800 p-4 space-y-3"
              >
                <label className="block space-y-1.5">
                  <span className="text-xs text-zinc-300">
                    Digite o valor em reais (mínimo R$ 0,99)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-zinc-400">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customInput}
                      onChange={(e) => {
                        setCustomInput(e.target.value);
                        setCustomError(null);
                      }}
                      placeholder="0,99"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#111115] border border-zinc-700 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#e5ad04] transition-colors whitespace-nowrap"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Gerar PIX
                    </button>
                  </div>
                </label>
                {customError && <p className="text-xs text-red-400">{customError}</p>}
              </form>
            )}

            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Continuar gratuitamente sem doar
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: QR CODE + PIX COPIA E COLA */}
        {step === 'qrcode' && (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Alterar valor
              </button>
              <span className="font-mono text-base font-bold text-[#F2B705] tabular-nums">
                {formatBrlCurrency(selectedAmount)}
              </span>
            </div>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3 rounded-2xl bg-white shadow-xl inline-block">
                <canvas
                  ref={qrCanvasRef}
                  width={264}
                  height={264}
                  className="w-[220px] h-[220px] sm:w-[240px] sm:h-[240px] block"
                  aria-label="QR Code PIX com a marca Atelier Club no centro"
                />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-200">
                  Escaneie o QR Code no aplicativo do seu banco
                </p>
                <p className="text-[11px] text-zinc-400">
                  Favorecido: {donation.recipientName} · Chave: <span className="font-mono">{donation.pixKey}</span>
                </p>
              </div>
            </div>

            {/* PIX Copia e Cola */}
            <div className="space-y-2">
              <span className="text-xs text-zinc-300 block">
                Link PIX Copia e Cola
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixCode}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-[11px] font-mono text-zinc-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#e5ad04] transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedPix ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar PIX
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                Voltar sem doar
              </button>
              <button
                type="button"
                onClick={() => setStep('thanks')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 text-zinc-950 font-semibold text-xs hover:bg-emerald-400 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Já concluí o pagamento
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: THANK YOU */}
        {step === 'thanks' && (
          <div className="p-8 text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono text-[#F2B705] tabular-nums">
                Apoio registrado · {formatBrlCurrency(selectedAmount)}
              </p>
              <h2 className="font-display text-2xl font-bold text-zinc-50">
                Muito obrigado pelo seu apoio!
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-md mx-auto">
                {donation.thankYouMessage ||
                  'Sua contribuição ajuda diretamente a manter os servidores no ar e evoluir os recursos do Atelier Club.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors"
            >
              Continuar no Atelier Club
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
