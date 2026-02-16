import { memo } from 'react';

export interface CostDisplayProps {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  isDarkMode: boolean;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatCost(cost: number, hasTokens: boolean): string {
  if (cost === 0 && hasTokens) return 'N/A';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export const CostDisplay = memo(function CostDisplay({
  totalInputTokens,
  totalOutputTokens,
  estimatedCostUsd,
  isDarkMode,
}: CostDisplayProps) {
  const totalTokens = totalInputTokens + totalOutputTokens;
  if (totalTokens === 0) return null;

  const hasTokens = totalTokens > 0;
  const costText = formatCost(estimatedCostUsd, hasTokens);

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1 text-xs ${
        isDarkMode ? 'text-sky-400/70' : 'text-sky-600/70'
      }`}>
      <span>{formatTokenCount(totalTokens)} tokens</span>
      <span className={isDarkMode ? 'text-sky-700' : 'text-sky-300'}>|</span>
      <span>{costText}</span>
    </div>
  );
});
