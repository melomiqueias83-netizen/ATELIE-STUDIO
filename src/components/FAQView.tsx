import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  HeartHandshake,
  HelpCircle,
  Image as ImageIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import { AppTab } from '../types/studio';

interface FAQViewProps {
  onNavigateTab: (tab: AppTab) => void;
  onOpenCollection: () => void;
  onOpenDonation?: () => void;
}

type FaqCategory = 'Todas' | 'Downloads & 4K' | 'IA & Créditos' | 'Licença & Uso' | 'Conta & Recursos';

interface FaqItem {
  id: string;
  number: string;
  category: Exclude<FaqCategory, 'Todas'>;
  question: string;
  answer: string[];
  actionLabel?: string;
  actionType?: 'gallery' | 'templates' | 'background' | 'photo' | 'collection' | 'donation';
}

const FAQ_CATEGORIES: FaqCategory[] = [
  'Todas',
  'Downloads & 4K',
  'IA & Créditos',
  'Licença & Uso',
  'Conta & Recursos',
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'how-to-download',
    number: '01',
    category: 'Downloads & 4K',
    question: 'Como baixar as imagens?',
    answer: [
      'Na aba Galeria, clique em qualquer papel de parede 4K para abrir os detalhes e selecione "Baixar 4K". O arquivo será salvo em PNG na resolução nativa (2160 × 3840 para celular ou 3840 × 2160 para desktop).',
      'Se quiser baixar várias artes de uma só vez, abra "Coleção" no menu superior, marque até 3 papéis de parede favoritos ou projetos salvos e clique em "Baixar ZIP".',
      'Nos estúdios (Modelos IA, Criar Fundo e Estúdio Foto), use o botão "Baixar PNG" para exportar na proporção configurada.',
    ],
    actionLabel: 'Ir para a Galeria 4K',
    actionType: 'gallery',
  },
  {
    id: 'ai-credits',
    number: '02',
    category: 'IA & Créditos',
    question: 'Como funcionam os créditos de IA?',
    answer: [
      'O Atelier Club é 100% gratuito e não exige compra de créditos, assinatura mensal nem planos pagos para utilizar os recursos de inteligência artificial.',
      'Você pode gerar modelos gráficos em "Modelos IA", criar receitas de cenário em "Criar Fundo" e analisar iluminação e recorte no "Estúdio Foto" livremente, respeitando apenas a cota de requisições da chave Gemini configurada no servidor.',
      'Para ajudar a manter os servidores gratuitos no ar, existe a opção voluntária de doação via PIX a partir de R$ 0,99 — mas todas as funções continuam liberadas doando ou não.',
    ],
    actionLabel: 'Testar Modelos IA',
    actionType: 'templates',
  },
  {
    id: 'commercial-use',
    number: '03',
    category: 'Licença & Uso',
    question: 'Posso usar comercialmente?',
    answer: [
      'Sim. Os papéis de parede procedurais, layouts gerados em Modelos IA, planos de fundo sintéticos e composições exportadas nos estúdios podem ser utilizados tanto em projetos pessoais quanto comerciais (redes sociais, anúncios, capas, apresentações e materiais para clientes).',
      'Ao enviar fotografias ou logotipos próprios no Estúdio Foto, certifique-se de que você possui os direitos de uso dessas imagens enviadas do seu dispositivo.',
      'Não é permitido redistribuir ou revender o catálogo bruto de papéis de parede do aplicativo como um banco de imagens concorrente.',
    ],
  },
  {
    id: 'google-account-sync',
    number: '04',
    category: 'Conta & Recursos',
    question: 'Preciso fazer login com Google para usar o aplicativo?',
    answer: [
      'Não é obrigatório. Você pode navegar pela galeria, baixar artes 4K, editar modelos e usar todos os estúdios normalmente sem criar conta.',
      'Ao clicar em "Entrar com Google", seus favoritos, projetos editáveis e o Histórico de IA ficam sincronizados na nuvem para acesso em outros dispositivos.',
    ],
    actionLabel: 'Abrir Conta & Coleção',
    actionType: 'collection',
  },
  {
    id: 'ai-history',
    number: '05',
    category: 'Conta & Recursos',
    question: 'Onde ficam salvos meus prompts e gerações recentes de IA?',
    answer: [
      'Sempre que você gera um modelo, plano de fundo ou análise fotográfica com IA, o registro é salvo automaticamente na seção "Histórico" dentro da gaveta "Coleção".',
      'São armazenados os últimos 10 prompts e resultados gerados. Com um clique em "Reutilizar Prompt" ou "Reabrir Resultado", você recarrega tudo direto no estúdio para continuar editando.',
    ],
    actionLabel: 'Ver Histórico na Coleção',
    actionType: 'collection',
  },
  {
    id: 'aspect-ratios',
    number: '06',
    category: 'Downloads & 4K',
    question: 'Quais formatos de tela e redes sociais estão disponíveis?',
    answer: [
      'Você pode exportar diretamente nas proporções 9:16 (2160 × 3840 para celular e Stories), 16:9 (3840 × 2160 para desktop 4K), 1:1 (1080 × 1080 para feed), 4:5 (1080 × 1350 retrato Instagram) e 1200 × 630 (Facebook e links).',
      'Pelo modal de compartilhamento, também é possível adaptar a legenda e baixar a variação exata para cada rede social.',
    ],
    actionLabel: 'Abrir Criar Fundo',
    actionType: 'background',
  },
  {
    id: 'photo-cutout-ai',
    number: '07',
    category: 'IA & Créditos',
    question: 'Como funciona a remoção de fundo e ajuste de luz no Estúdio Foto?',
    answer: [
      'Envie qualquer retrato ou foto de produto no Estúdio Foto e clique em "Analisar com IA". A IA sugere automaticamente o modo de recorte, brilho, contraste, temperatura de cor, luz de recorte (rim light) e sombra de contato.',
      'Se quiser refinar detalhes nas bordas, utilize o pincel de "Apagar" ou "Restaurar" diretamente sobre a imagem antes de exportar.',
    ],
    actionLabel: 'Ir para Estúdio Foto',
    actionType: 'photo',
  },
  {
    id: 'push-notifications',
    number: '08',
    category: 'Conta & Recursos',
    question: 'Como recebo avisos de novas coleções de papéis de parede?',
    answer: [
      'Ative o botão "Notificações de novas coleções" na barra da Galeria ou dentro do seu perfil na gaveta Coleção e autorize as notificações no navegador.',
      'Quando novas coleções 4K forem publicadas no aplicativo, você receberá um alerta com link direto para explorar a categoria.',
    ],
  },
];

export const FAQView: React.FC<FAQViewProps> = ({
  onNavigateTab,
  onOpenCollection,
  onOpenDonation,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([
    'how-to-download',
    'ai-credits',
    'commercial-use',
  ]);

  const filteredItems = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory =
        selectedCategory === 'Todas' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
        item.question.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.answer.some((paragraph) => paragraph.toLowerCase().includes(term))
      );
    });
  }, [selectedCategory, searchQuery]);

  const toggleItem = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allVisibleOpen =
    filteredItems.length > 0 && filteredItems.every((item) => openIds.includes(item.id));

  const handleToggleAllVisible = () => {
    if (allVisibleOpen) {
      const visibleSet = new Set(filteredItems.map((i) => i.id));
      setOpenIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setOpenIds((prev) => Array.from(new Set([...prev, ...filteredItems.map((i) => i.id)])));
    }
  };

  const handleAction = (type?: FaqItem['actionType']) => {
    switch (type) {
      case 'gallery':
        onNavigateTab('gallery');
        break;
      case 'templates':
        onNavigateTab('templates');
        break;
      case 'background':
        onNavigateTab('background');
        break;
      case 'photo':
        onNavigateTab('photo');
        break;
      case 'collection':
        onOpenCollection();
        break;
      case 'donation':
        onOpenDonation?.();
        break;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Search */}
      <section className="border-b border-zinc-800/80 pb-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-[#F2B705] tracking-wide">
              Central de Ajuda · Atelier Club
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-50">
              Perguntas Frequentes
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
              Respostas diretas sobre downloads em 4K, funcionamento gratuito dos recursos de IA,
              direitos de uso comercial e sincronização da sua coleção.
            </p>
          </div>

          <div className="w-full lg:w-80">
            <label htmlFor="faq-search" className="sr-only">
              Buscar nas perguntas frequentes
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="faq-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar dúvida (ex: baixar, créditos, comercial)..."
                className="w-full rounded-lg bg-[#111115] border border-zinc-800 pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#F2B705]"
              />
            </div>
          </div>
        </div>

        {/* Interactive Category Tabs + Expand/Collapse */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {FAQ_CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#F2B705] text-zinc-950 font-semibold'
                      : 'bg-[#111115] text-zinc-400 hover:text-zinc-100 border border-zinc-800'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={handleToggleAllVisible}
              className="text-xs text-zinc-400 hover:text-[#F2B705] transition-colors self-start sm:self-auto whitespace-nowrap"
            >
              {allVisibleOpen ? 'Recolher todas' : 'Expandir todas'}
            </button>
          )}
        </div>
      </section>

      {/* Main 2-Column Editorial Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
        {/* Left Navigation & Quick Shortcuts */}
        <aside className="rounded-2xl bg-[#111115] border border-zinc-800 p-5 space-y-5 lg:sticky lg:top-24">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
              <HelpCircle className="w-4 h-4 text-[#F2B705]" />
              <span>Atalhos do Estúdio</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Acesse rapidamente as ferramentas principais do Atelier Club.
            </p>
          </div>

          <div className="space-y-2 pt-1 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => onNavigateTab('gallery')}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#0C0C0F] border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-200 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-[#F2B705]" />
                <span>Galeria 4K Gratuita</span>
              </span>
              <span className="text-zinc-500">→</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('templates')}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#0C0C0F] border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-200 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#F2B705]" />
                <span>Modelos Editáveis IA</span>
              </span>
              <span className="text-zinc-500">→</span>
            </button>

            <button
              type="button"
              onClick={onOpenCollection}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#0C0C0F] border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-200 transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-[#F2B705]" />
                <span>Coleção, ZIP &amp; Histórico</span>
              </span>
              <span className="text-zinc-500">→</span>
            </button>
          </div>

          {onOpenDonation && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
              <p className="text-xs text-zinc-400 leading-relaxed">
                O Atelier Club é gratuito. Se quiser contribuir para os servidores e novas artes:
              </p>
              <button
                type="button"
                onClick={onOpenDonation}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg bg-[#16161B] border border-[#F2B705]/40 text-xs font-semibold text-[#F2B705] hover:bg-[#1C1C23] transition-colors"
              >
                <HeartHandshake className="w-4 h-4" />
                <span>Apoiar via PIX (a partir de R$ 0,99)</span>
              </button>
            </div>
          )}
        </aside>

        {/* Right FAQ Accordion */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl bg-[#111115] border border-dashed border-zinc-800 p-10 text-center space-y-3">
              <p className="text-sm font-medium text-zinc-200">
                Nenhuma pergunta encontrada para &ldquo;{searchQuery}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('Todas');
                }}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition-colors"
              >
                Mostrar todas as perguntas
              </button>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = openIds.includes(item.id);
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border transition-colors ${
                    isExpanded
                      ? 'bg-[#111115] border-zinc-700'
                      : 'bg-[#0D0D11] border-zinc-800/90 hover:border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-expanded={isExpanded}
                    className="w-full text-left px-5 sm:px-6 py-5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-xs text-zinc-400">
                        <span className="font-mono-tabular text-[#F2B705]">{item.number}.</span>
                        <span aria-hidden="true"> · </span>
                        <span>{item.category}</span>
                      </p>
                      <h2 className="text-base sm:text-lg font-semibold text-zinc-100 leading-snug">
                        {item.question}
                      </h2>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-zinc-400 shrink-0 mt-1 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-[#F2B705]' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-5 sm:px-6 pb-5 pt-1 border-t border-zinc-800/70 space-y-3">
                      {item.answer.map((paragraph, idx) => (
                        <p key={idx} className="text-sm text-zinc-300 leading-relaxed">
                          {paragraph}
                        </p>
                      ))}

                      {item.actionLabel && item.actionType && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleAction(item.actionType)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F2B705] hover:underline"
                          >
                            <span>{item.actionLabel}</span>
                            <span aria-hidden="true">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
