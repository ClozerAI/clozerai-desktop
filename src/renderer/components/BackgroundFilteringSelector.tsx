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

interface BackgroundFilteringSelectorProps {
  selectedLevel: string;
  onLevelChange: (level: string) => void;
}

export default function BackgroundFilteringSelector({
  selectedLevel,
  onLevelChange,
}: BackgroundFilteringSelectorProps) {
  const filteringLevels = [
    { value: '0', label: 'None' },
    { value: '1.5', label: 'Low', recommended: true },
    { value: '3', label: 'Mild' },
    { value: '4.5', label: 'High' },
  ];

  return (
    <div className="flex flex-col gap-y-1">
      <LabelWithTooltip
        icon={<Volume2 className="h-4 w-4" />}
        tooltip="Choose the level of background noise filtering. Higher levels reduce background noise but require you to speak louder."
      >
        Background Filtering Level
      </LabelWithTooltip>
      <Select value={selectedLevel} onValueChange={onLevelChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select filtering level..." />
        </SelectTrigger>
        <SelectContent>
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
