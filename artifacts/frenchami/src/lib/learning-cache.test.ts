import assert from "node:assert/strict";
import test from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetLearningStateQueryKey,
  getGetVocabularyQueryKey,
  type LearningState,
} from "@workspace/api-client-react";
import { commitLearningState, learningStateQueryOptions } from "./learning-cache";

const initialState: LearningState = {
  savedWords: ["bonjour"],
  learnedWords: ["merci"],
  quizAttempts: [],
  xp: 0,
};

test("learning state reload policy restores persisted state after navigation", () => {
  const options = learningStateQueryOptions(true);
  assert.equal(options.enabled, true);
  assert.equal(options.refetchOnMount, "always");
  assert.deepEqual(options.queryKey, getGetLearningStateQueryKey());
});

test("successful learning mutations replace state and refresh dependent caches", async () => {
  const queryClient = new QueryClient();
  const state: LearningState = {
    ...initialState,
    savedWords: ["bonjour", "salut"],
    learnedWords: ["salut"],
    xp: 20,
  };
  const invalidated: unknown[] = [];
  const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = async (filters) => {
    invalidated.push(filters.queryKey);
    return originalInvalidate(filters);
  };

  await commitLearningState(queryClient, state, {
    vocabularyCategory: "beginner",
    refreshDashboard: true,
  });

  assert.deepEqual(queryClient.getQueryData(getGetLearningStateQueryKey()), state);
  assert.deepEqual(invalidated, [
    getGetLearningStateQueryKey(),
    getGetVocabularyQueryKey("beginner"),
    getGetDashboardQueryKey(),
  ]);
});

test("failed save or learned mutations leave the visible cache unchanged", async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(getGetLearningStateQueryKey(), initialState);

  const failedMutation = new MutationObserver(queryClient, {
    mutationFn: async (): Promise<LearningState> => {
      throw new Error("The progress request failed");
    },
    onSuccess: (state) => commitLearningState(queryClient, state),
  });
  await assert.rejects(failedMutation.mutate(), /progress request failed/);

  // The same onSuccess path used by save and learned controls is never invoked for a failed request.
  assert.deepEqual(queryClient.getQueryData(getGetLearningStateQueryKey()), initialState);
});