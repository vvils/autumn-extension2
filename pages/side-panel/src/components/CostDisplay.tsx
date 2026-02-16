import { memo } from 'react';

export interface CostDisplayProps {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
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
}: CostDisplayProps) {
  const totalTokens = totalInputTokens + totalOutputTokens;
  if (totalTokens === 0) return null;

  const hasTokens = totalTokens > 0;
  const costText = formatCost(estimatedCostUsd, hasTokens);

  return (
    <div className="text-accent/70 flex items-center gap-1.5 text-[10px]">
      <span>{formatTokenCount(totalTokens)} tokens</span>
      <span className="text-gray-300">|</span>
      <span>{costText}</span>
    </div>
  );
});
