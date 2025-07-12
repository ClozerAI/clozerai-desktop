import { cn } from '../lib/utils';

interface CombinedTranscriptBubblesProps {
  combinedTranscript: {
    finalTranscript: string;
    partialTranscript?: string;
    type: 'share' | 'microphone' | 'combined';
    createdAt: Date;
  }[];
  isRecordingMicrophone?: boolean;
  isRecordingShare?: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export default function CombinedTranscriptBubbles({
  combinedTranscript,
  isRecordingMicrophone,
  isRecordingShare,
  onMouseEnter,
  onMouseLeave,
}: CombinedTranscriptBubblesProps) {
  return (
    <div
      className="text-xs flex flex-col gap-2 py-1 max-h-[400px] overflow-y-auto"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {combinedTranscript.length > 0
        ? combinedTranscript.map((t) => (
            <div
              key={t.createdAt.getTime()}
              className={cn(
                'rounded-lg text-white w-full',
                t.type === 'microphone' ? 'self-end text-right' : 'self-start',
              )}
            >
              <div>
                {t.finalTranscript}
                <span className="opacity-70">{t.partialTranscript}</span>
              </div>
              <div className={cn('text-xs text-gray-600')}>
                {t.type === 'share'
                  ? 'Client'
                  : t.type === 'microphone'
                    ? 'You'
                    : 'Combined'}{' '}
                ·{' '}
                {t.createdAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))
        : isRecordingShare || isRecordingMicrophone
          ? 'Listening...'
          : null}
    </div>
  );
}
