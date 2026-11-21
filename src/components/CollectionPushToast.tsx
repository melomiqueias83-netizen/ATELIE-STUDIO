import React from 'react';
import { Bell, ArrowRight, X } from 'lucide-react';
import { CollectionAlertRecord } from '../types/studio';

interface CollectionPushToastProps {
  alert: CollectionAlertRecord | null;
  onExplore: (category: CollectionAlertRecord['category']) => void;
  onClose: () => void;
}

export const CollectionPushToast: React.FC<CollectionPushToastProps> = ({
  alert,
  onExplore,
  onClose,
}) => {
  if (!alert) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl bg-[#111115] border border-[#F2B705]/40 shadow-2xl p-4 flex items-start gap-3.5"
    >
      {alert.imageUrl ? (
        <img
          src={alert.imageUrl}
          alt={alert.title}
          referrerPolicy="no-referrer"
          className="w-12 h-14 rounded-lg object-cover border border-zinc-800 shrink-0 bg-zinc-900"
        />
      ) : (
        <div className="w-12 h-14 rounded-lg bg-gradient-to-br from-[#F2B705]/20 via-zinc-900 to-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-[#F2B705]" />
        </div>
      )}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium text-[#F2B705] truncate">
            Nova Coleção · {alert.category}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar notificação"
            className="text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-sm font-semibold text-zinc-100 leading-snug">{alert.title}</p>
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{alert.body}</p>
        <div className="pt-1.5">
          <button
            type="button"
            onClick={() => onExplore(alert.category)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F2B705] hover:underline"
          >
            <span>Explorar coleção</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
