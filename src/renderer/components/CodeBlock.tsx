import React, { memo, useCallback, useMemo, useState } from 'react';
import hljs from 'highlight.js';
import { cn } from '@/renderer/lib/utils';
import { Button } from './ui/button';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';
import { toast } from 'sonner';

type CodeProps = React.HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  node?: unknown;
  children?: React.ReactNode;
};

export const CodeBlock = memo(function CodeBlock({
  className,
  children,
  inline,
  node,
  ...props
}: CodeProps) {
  const language = useMemo(
    () => className?.replace('language-', ''),
    [className],
  );
  const codeString = useMemo(
    () => String(children).replace(/\n$/, ''),
    [children],
  );

  const highlightedCode = useMemo(() => {
    if (!language) {
      return hljs.highlightAuto(codeString).value;
    }

    try {
      return hljs.highlight(codeString, { language }).value;
    } catch (error) {
      // Fallback to auto-detection if language isn't supported
      console.warn(
        `Language '${language}' not supported, falling back to auto-detection`,
      );
      return hljs.highlightAuto(codeString).value;
    }
  }, [language, codeString]);

  const highlightedHtml = useMemo(
    () => ({ __html: highlightedCode }),
    [highlightedCode],
  );

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (window.electron?.ipcRenderer?.writeClipboard) {
        // Use Electron's clipboard API
        await window.electron.ipcRenderer.writeClipboard(codeString);
      } else {
        // Fallback to browser API if available
        await navigator.clipboard.writeText(codeString);
      }
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  }, [codeString]);

  return (
    <pre
      className={cn(
        className,
        'relative whitespace-pre-wrap break-words rounded bg-gray-900/50',
        language ? 'my-1 p-2 pt-6' : 'inline-block px-2',
      )}
    >
      {language && (
        <>
          <span className="absolute left-2 top-2 font-mono text-xs text-gray-500">
            {language}
          </span>
          <Button
            size="sm"
            className="absolute right-2 top-2 h-8 w-8 p-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
      <code dangerouslySetInnerHTML={highlightedHtml} {...props} />
    </pre>
  );
});
