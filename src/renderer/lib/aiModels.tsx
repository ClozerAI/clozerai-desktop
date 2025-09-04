import type { sessionAIModelEnum } from '@nextjs-types/server/db/schema.js' with { 'resolution-mode': 'import' };
import { Brain, Rabbit } from 'lucide-react';

export const aiModelNameMap: Record<
  (typeof sessionAIModelEnum.enumValues)[number],
  string
> = {
  'gpt-4.1': 'Smarter',
  'gpt-4.1-mini': 'Faster',
};

export const aiModelLogoMap: Record<
  (typeof sessionAIModelEnum.enumValues)[number],
  React.JSX.Element
> = {
  'gpt-4.1': <Brain className="text-black" />,
  'gpt-4.1-mini': <Rabbit className="text-black" />,
};
