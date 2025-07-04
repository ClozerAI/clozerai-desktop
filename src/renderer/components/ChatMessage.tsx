import React, { useMemo } from 'react';
// @ts-ignore
import Markdown, { Components } from 'react-markdown';
import { UIMessage } from 'ai';
import { CodeBlock } from './CodeBlock';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import rehypeRaw from 'rehype-raw';

type ChatMessageProps = {
  message: UIMessage;
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  // Function to convert bullet characters to proper Markdown list syntax
  const convertBulletsToMarkdown = (content: string): string => {
    return (
      content
        // Convert bullet character • to markdown list item
        .replace(/^•\s+/gm, '- ')
        // Also handle other common bullet characters
        .replace(/^‣\s+/gm, '- ')
        .replace(/^▪\s+/gm, '- ')
        .replace(/^▫\s+/gm, '- ')
        .replace(/^‧\s+/gm, '- ')
    );
  };

  const markdownComponents: Components = useMemo(
    () => ({
      code: CodeBlock as Components['code'],
      hr: () => <hr className="mx-10 border-gray-700" />,
      h1: ({ children }) => (
        <h1 className="mb-2 text-2xl font-semibold">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="mb-1 text-xl font-semibold">{children}</h2>
      ),
      h3: ({ children }) => <h3 className="text-lg font-medium">{children}</h3>,
      h4: ({ children }) => (
        <h4 className="text-base font-medium">{children}</h4>
      ),
      // List support
      ul: ({ children }) => <ul className="mb-1">{children}</ul>,
      ol: ({ children }) => <ol className="mb-1">{children}</ol>,
      li: ({ children }) => <li className="mb-1">{children}</li>,
      // Blockquote support
      blockquote: ({ children }) => (
        <blockquote className="my-1 border-l-4 border-gray-700 pl-4 text-gray-300 italic">
          {children}
        </blockquote>
      ),
      // Table support
      table: ({ children }) => (
        <div className="my-1 overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => (
        <tr className="border-b border-gray-200">{children}</tr>
      ),
      th: ({ children }) => (
        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-gray-300 px-4 py-2">{children}</td>
      ),
      // Add image support with custom styling
      img: ({ src, alt, ...props }) => (
        <div className="my-1 flex justify-center">
          <img
            src={src}
            alt={alt}
            className="max-w-full rounded shadow-sm"
            {...props}
          />
        </div>
      ),
      // Add task list support
      input: ({ type, checked, ...props }) => {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={checked}
              disabled
              className="mr-2"
              {...props}
            />
          );
        }
        return <input type={type} {...props} />;
      },
    }),
    [],
  );

  return (
    <Markdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
    >
      {convertBulletsToMarkdown(message.content)}
    </Markdown>
  );
};

export default ChatMessage;
