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

interface LanguageSelectorProps {
  selectedLanguage: TranscriptionLanguage;
  onLanguageChange: (language: TranscriptionLanguage) => void;
  disabled?: boolean;
}

export default function LanguageSelector({
  selectedLanguage,
  onLanguageChange,
  disabled = false,
}: LanguageSelectorProps) {
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
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Language..." />
        </SelectTrigger>
        <SelectContent>
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
