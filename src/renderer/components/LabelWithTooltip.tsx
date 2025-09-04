import { Info } from 'lucide-react';
import { Label } from '@/renderer/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Helper component for labels with tooltips
export function LabelWithTooltip({
  children,
  tooltip,
  icon,
}: {
  children: React.ReactNode;
  tooltip: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <Label className="flex items-center gap-1">{children}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="text-muted-foreground h-3 w-3 cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="text-center">
          <p className="max-w-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
