import React from 'react';
import { ShoppingBag, BarChart3, TrendingUp, Compass } from 'lucide-react';

interface Suggestion {
  id?: string;
  category?: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  prompt: string;
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    id: 'saas',
    category: 'SaaS Platform',
    label: 'SaaS Metrics',
    description: 'Track MRR growth, user churn rate, and CAC.',
    icon: Compass,
    prompt: 'SaaS Enterprise Executive Dashboard showing monthly recurring revenue (MRR), subscriber acquisition trends, average revenue per user (ARPU), cost of acquisition (CAC) and customer churn rate. Categorize clients into SMB, Mid-market, and Enterprise sectors. Include a date filter.'
  },
  {
    id: 'ecommerce',
    category: 'E-Commerce',
    label: 'E-commerce Conversion',
    description: 'Analyze online storefront transactions, cart values, and product categories.',
    icon: ShoppingBag,
    prompt: 'E-Commerce Storefront Analytics displaying Daily Sales volume, conversion funnel stages (View, Add-to-Cart, Checkout, Completed Purchase), average order value (AOV) by Category (Electronics, Fashion, Home, Beauty), and top revenue sources. Include a category select filter.'
  },
  {
    id: 'marketing',
    category: 'Paid Acquisition',
    label: 'Ad Campaign ROI',
    description: 'Visualize ROI, impressions click CTR, and CPA distribution relative to platforms.',
    icon: BarChart3,
    prompt: 'Acquisition Marketing Multi-Channel Performance Dashboard tracking click-through rate (CTR), cost per click (CPC), overall ad spend, conversions count, and cost per acquisition (CPA) segmented by Meta Ads, Google Ads, TikTok Ads, and YouTube. Provide regional and platform Select Filters.'
  },
  {
    id: 'crypto',
    category: 'Fintech',
    label: 'Crypto Portfolio',
    description: 'Track price volatility, coin distributions, and token volumes.',
    icon: TrendingUp,
    prompt: 'Crypto Portfolio Tracking and Asset Volatility board displaying overall net portfolio worth, active token holds percentage allocations (BTC, ETH, SOL, LINK, AVAX), historic price volumes, daily changes, and transaction types. Include asset select options.'
  }
];

interface SuggestionChipsProps {
  suggestions?: Suggestion[] | string[];
  onSelected: (prompt: string) => void;
  className?: string;
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, onSelected, className = "" }) => {
  const items: Suggestion[] = React.useMemo(() => {
    if (!suggestions) return DEFAULT_SUGGESTIONS;
    return (suggestions as any[]).map((s, idx) => {
      if (typeof s === 'string') {
        return { label: s, prompt: s, id: `suggestion_${idx}` };
      }
      return s;
    });
  }, [suggestions]);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((s, idx) => {
        const Icon = s.icon;
        
        // Match appropriate background colors
        const colorMap: Record<string, { ring: string; text: string; bg: string; hoverBg: string }> = {
          saas: { ring: 'border-violet-200 dark:border-violet-900/30', text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50/40 dark:bg-violet-950/10', hoverBg: 'hover:bg-violet-50 dark:hover:bg-violet-950/20' },
          ecommerce: { ring: 'border-pink-200 dark:border-pink-900/30', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50/40 dark:bg-pink-950/10', hoverBg: 'hover:bg-pink-50 dark:hover:bg-pink-950/20' },
          marketing: { ring: 'border-emerald-200 dark:border-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-500', bg: 'bg-emerald-50/40 dark:bg-emerald-950/10', hoverBg: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20' },
          crypto: { ring: 'border-amber-200 dark:border-amber-900/30', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50/40 dark:bg-amber-950/10', hoverBg: 'hover:bg-amber-50 dark:hover:bg-amber-950/20' }
        };

        const colors = (s.id && colorMap[s.id]) ? colorMap[s.id] : { 
          ring: 'border-indigo-100 dark:border-indigo-900/30', 
          text: 'text-indigo-600 dark:text-indigo-400', 
          bg: 'bg-indigo-50/40 dark:bg-indigo-950/10', 
          hoverBg: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/20' 
        };

        return (
          <button
            key={s.id || idx}
            type="button"
            onClick={() => onSelected(s.prompt)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${colors.ring} ${colors.text} ${colors.bg} ${colors.hoverBg} hover:shadow-[0_2px_10px_rgba(124,58,237,0.04)] hover:border-violet-500/50 transition-all duration-200 cursor-pointer max-w-full truncate`}
            title={s.description || s.label}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
};
