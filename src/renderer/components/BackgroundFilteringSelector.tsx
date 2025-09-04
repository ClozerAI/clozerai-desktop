'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Volume2 } from 'lucide-react';
import { LabelWithTooltip } from '@/renderer/components/LabelWithTooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface BackgroundFilteringSelectorProps {
  selectedLevel: string | undefined;
  onLevelChange: (level: string) => void;
  disabled?: boolean;
  compact?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function BackgroundFilteringSelector({
  selectedLevel,
  onLevelChange,
  disabled = false,
  compact = false,
  onMouseEnter,
  onMouseLeave,
}: BackgroundFilteringSelectorProps) {
  const filteringLevels = [
    { value: '0', label: 'None' },
    { value: '1.5', label: 'Low', recommended: true },
    { value: '3', label: 'Mild' },
    { value: '4.5', label: 'High' },
  ];

  if (compact) {
    return (
      <Select
        value={selectedLevel}
        onValueChange={onLevelChange}
        disabled={disabled}
      >
        <Tooltip>
          <TooltipTrigger>
            <SelectTrigger
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              className="border-none bg-primary"
              size="sm"
            >
              <Volume2 className="h-4 w-4 text-white" />
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Background Filtering:{' '}
            {selectedLevel === '0'
              ? 'None'
              : selectedLevel === '1.5'
                ? 'Low'
                : selectedLevel === '3'
                  ? 'Mild'
                  : 'High'}{' '}
          </TooltipContent>
        </Tooltip>
        <SelectContent onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          {filteringLevels.map((level) => (
            <SelectItem key={level.value} value={level.value}>
              {level.label}
              {level.recommended && (
                <span className="text-muted-foreground ml-1">
                  (Recommended)
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-col gap-y-1">
      <LabelWithTooltip
        icon={<Volume2 className="h-4 w-4" />}
        tooltip="Choose the level of background noise filtering. Higher levels reduce background noise but require you to speak louder."
      >
        Background Filtering Level
      </LabelWithTooltip>
      <Select
        value={selectedLevel}
        onValueChange={onLevelChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select filtering level..." />
        </SelectTrigger>
        <SelectContent onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          {filteringLevels.map((level) => (
            <SelectItem key={level.value} value={level.value}>
              {level.label}
              {level.recommended && (
                <span className="text-muted-foreground">(Recommended)</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
