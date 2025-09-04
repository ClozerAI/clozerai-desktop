'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Bot } from 'lucide-react';
import { LabelWithTooltip } from '@/renderer/components/LabelWithTooltip';
import type { sessionAIModelEnum } from '@nextjs-types/server/db/schema.js' with { 'resolution-mode': 'import' };
import { aiModelLogoMap, aiModelNameMap } from '@/renderer/lib/aiModels';

interface AIModelSelectorProps {
  selectedModel: (typeof sessionAIModelEnum.enumValues)[number];
  onModelChange: (
    model: (typeof sessionAIModelEnum.enumValues)[number],
  ) => void;
  disabled?: boolean;
}

export default function AIModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
}: AIModelSelectorProps) {
  return (
    <div className="flex flex-col gap-y-1">
      <LabelWithTooltip
        icon={<Bot className="h-4 w-4" />}
        tooltip="Choose which AI model to use for generating responses. Different models may have varying capabilities and response styles."
      >
        AI Model
      </LabelWithTooltip>
      <Select
        value={selectedModel}
        onValueChange={(value) =>
          onModelChange(value as (typeof sessionAIModelEnum.enumValues)[number])
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select AI Model..." />
        </SelectTrigger>
        <SelectContent>
          {['gpt-4.1', 'gpt-4.1-mini'].map((model) => (
            <SelectItem key={model} value={model}>
              <div className="flex flex-row items-center gap-x-2">
                {
                  aiModelLogoMap[
                    model as (typeof sessionAIModelEnum.enumValues)[number]
                  ]
                }
                <span>
                  {
                    aiModelNameMap[
                      model as (typeof sessionAIModelEnum.enumValues)[number]
                    ]
                  }
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
