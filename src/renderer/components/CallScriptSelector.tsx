'use client';

import { api } from '../lib/trpc/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ScrollText } from 'lucide-react';

interface CallScriptSelectorProps {
  selectedScriptId: string | null;
  onScriptChange: (scriptId: string | null) => void;
  disabled?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function CallScriptSelector({
  selectedScriptId,
  onScriptChange,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
}: CallScriptSelectorProps) {
  const {
    data: scriptsResponse,
    isLoading,
    error,
  } = api.callScripts.getScripts.useQuery({
    limit: 100,
    offset: 0,
  });

  // Don't render anything if there are no scripts or if the API call fails or if the component is loading
  if (
    error ||
    isLoading ||
    (!isLoading &&
      (!scriptsResponse?.data || scriptsResponse.data.length === 0))
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-y-1 w-full">
      <div className="text-sm text-white/80 flex items-center gap-1">
        <ScrollText className="h-3 w-3" />
        Call Script
        <span className="text-white/60 text-xs">(Optional)</span>
      </div>
      <Select
        value={selectedScriptId || 'none'}
        onValueChange={(value) =>
          onScriptChange(value === 'none' ? null : value)
        }
        disabled={isLoading || disabled}
      >
        <SelectTrigger
          className="bg-white text-black text-sm h-8 w-full"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <SelectValue
            placeholder={
              isLoading ? 'Loading scripts...' : 'Select a call script...'
            }
          />
        </SelectTrigger>
        <SelectContent onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          <SelectItem value="none">No script selected</SelectItem>
          {scriptsResponse?.data.map((script) => (
            <SelectItem key={script.id} value={script.id}>
              <div className="flex items-center gap-2">
                <ScrollText className="h-3 w-3" />
                <span>{script.title}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
