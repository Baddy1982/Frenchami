import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetLearningStateQueryKey,
  getGetVocabularyQueryKey,
  type LearningState,
} from "@workspace/api-client-react";

export function learningStateQueryOptions(isAuthenticated: boolean) {
  return {
    enabled: isAuthenticated,
    queryKey: getGetLearningStateQueryKey(),
    staleTime: 30_000,
    refetchOnMount: "always" as const,
  };
}

export async function commitLearningState(
  queryClient: QueryClient,
  state: LearningState,
  options: { vocabularyCategory?: string; refreshDashboard?: boolean } = {},
) {
  const learningStateKey = getGetLearningStateQueryKey();
  queryClient.setQueryData(learningStateKey, state);

  const invalidations = [queryClient.invalidateQueries({ queryKey: learningStateKey })];
  if (options.vocabularyCategory) {
    invalidations.push(queryClient.invalidateQueries({
      queryKey: getGetVocabularyQueryKey(options.vocabularyCategory),
    }));
  }
  if (options.refreshDashboard) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }));
  }
  await Promise.all(invalidations);
}