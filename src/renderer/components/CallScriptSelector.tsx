'use client';

import { api, NEXTJS_API_URL } from '@/renderer/lib/trpc/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { ScrollText, Plus } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { LabelWithTooltip } from '@/renderer/components/LabelWithTooltip';

interface CallScriptSelectorProps {
  selectedScriptId: string | null;
  onScriptChange: (scriptId: string | null) => void;
}

export default function CallScriptSelector({
  selectedScriptId,
  onScriptChange,
}: CallScriptSelectorProps) {
  const { data: scriptsResponse, isLoading } =
    api.callScripts.getScripts.useQuery({
      limit: 100,
      offset: 0,
    });

  return (
    <div className="flex flex-col gap-y-1">
      <LabelWithTooltip
        icon={<ScrollText className="h-4 w-4" />}
        tooltip={`If you select a script, a "Script" button will appear in your call session to get AI guidance based on your conversation progress (unless disabled in Settings → Real-time Prompts).`}
      >
        Call Script
        <span className="text-muted-foreground text-xs">(Optional)</span>
      </LabelWithTooltip>
      {scriptsResponse?.data.length === 0 ? (
        <Button asChild variant="outline" size="sm">
          <a
            href={NEXTJS_API_URL + '/dashboard/callScripts'}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Call Script
          </a>
        </Button>
      ) : (
        <Select
          value={selectedScriptId || 'none'}
          onValueChange={(value) =>
            onScriptChange(value === 'none' ? null : value)
          }
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                isLoading ? 'Loading scripts...' : 'Select a call script...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No script selected</SelectItem>
            {scriptsResponse?.data.map((script) => (
              <SelectItem key={script.id} value={script.id}>
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4" />
                  <span>{script.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
