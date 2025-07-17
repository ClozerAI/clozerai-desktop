import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { millisecondsToTimeString } from '../lib/millisecondsToTimeString';

type SessionTimerTooltipProps = {
  timeLeft: number | null;
  isExtendingSession: boolean;
  willAutoExtend: boolean;
  canAutoExtend: boolean;
  trial: boolean;
  canExtend: boolean;
  short?: boolean;
};

export default function SessionTimerTooltip({
  timeLeft,
  isExtendingSession,
  willAutoExtend,
  canAutoExtend,
  trial,
  canExtend,
  short = false,
}: SessionTimerTooltipProps) {
  if (!timeLeft || timeLeft <= 0) return null;

  return (
    <Tooltip
      open={
        canAutoExtend || willAutoExtend || trial || !canExtend
          ? undefined
          : false
      }
    >
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 text-white">
          <span>⏰ {millisecondsToTimeString(timeLeft, false)}</span>
          {isExtendingSession ? (
            <span className="text-sm opacity-70">(Extending...)</span>
          ) : willAutoExtend ? (
            <span className="text-sm opacity-70">
              (Will auto-extend
              {!short ? (
                <> in {millisecondsToTimeString(timeLeft - 60000, false)}</>
              ) : null}
              )
            </span>
          ) : trial ? (
            <span className="text-sm opacity-70">(Trial)</span>
          ) : null}
        </div>
      </TooltipTrigger>
      {willAutoExtend ? (
        <TooltipContent className="z-20">
          The session will auto extend.
        </TooltipContent>
      ) : canAutoExtend ? (
        <TooltipContent className="z-20">
          The session will auto extend 1 minute before it ends.
        </TooltipContent>
      ) : trial ? (
        <TooltipContent className="z-20">
          This is a trial session and can not be extended.
        </TooltipContent>
      ) : !canExtend ? (
        <TooltipContent className="z-20">
          This session will not auto extend because
          <br />
          you don't have an active subscription.
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
