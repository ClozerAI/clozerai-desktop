import { api } from './trpc/react';
import { useMemo } from 'react';

export interface Prompt {
  id: string;
  title: string;
  description: string;
}

export function usePrompts() {
  const { data: builtInPrompts, isLoading: isLoadingBuiltInPrompts } =
    api.realTimePrompts.getBuiltInPrompts.useQuery();

  const { data: realTimePromptsResponse, isLoading: isLoadingRealTimePrompts } =
    api.realTimePrompts.getMany.useQuery({
      limit: 100,
      offset: 0,
    });

  const realTimePrompts = realTimePromptsResponse?.data ?? [];

  const allPrompts = useMemo(() => {
    return [
      ...(realTimePrompts || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.prompt,
      })),
      ...(builtInPrompts?.builtInPrompts || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
      })),
    ];
  }, [realTimePrompts, builtInPrompts?.builtInPrompts]);

  return {
    builtInPrompts,
    realTimePrompts,
    allPrompts,
    isLoadingBuiltInPrompts,
    isLoadingRealTimePrompts,
    isLoading: isLoadingBuiltInPrompts || isLoadingRealTimePrompts,
  };
}
