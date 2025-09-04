'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Globe } from 'lucide-react';
import { LabelWithTooltip } from '@/renderer/components/LabelWithTooltip';
import transcriptionLanguageMap, {
  TranscriptionLanguage,
} from '@/renderer/lib/transcriptLanguageMap';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface LanguageSelectorProps {
  selectedLanguage: TranscriptionLanguage | undefined;
  onLanguageChange: (language: TranscriptionLanguage) => void;
  disabled?: boolean;
  compact?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function LanguageSelector({
  selectedLanguage,
  onLanguageChange,
  disabled = false,
  compact = false,
  onMouseEnter,
  onMouseLeave,
}: LanguageSelectorProps) {
  if (compact) {
    return (
      <Select
        value={selectedLanguage}
        onValueChange={(value) =>
          onLanguageChange(value as TranscriptionLanguage)
        }
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
              <Globe className="h-4 w-4 text-white" />
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Language:{' '}
            {
              transcriptionLanguageMap[
                selectedLanguage as TranscriptionLanguage
              ]
            }
          </TooltipContent>
        </Tooltip>
        <SelectContent onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          {Object.values(TranscriptionLanguage).map((language) => (
            <SelectItem key={language} value={language}>
              {transcriptionLanguageMap[language]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-col gap-y-1">
      <LabelWithTooltip
        icon={<Globe className="h-4 w-4" />}
        tooltip="Select the language for transcription and AI responses."
      >
        Language
      </LabelWithTooltip>
      <Select
        value={selectedLanguage}
        onValueChange={(value) =>
          onLanguageChange(value as TranscriptionLanguage)
        }
        disabled={disabled}
      >
        <SelectTrigger
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="w-full"
        >
          <SelectValue placeholder="Language..." />
        </SelectTrigger>
        <SelectContent onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          {Object.values(TranscriptionLanguage).map((language) => (
            <SelectItem key={language} value={language}>
              {transcriptionLanguageMap[language]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
