import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express, { type Express } from "express";
import { SendTutorMessageResponse } from "@workspace/api-zod";
import { createLearningProgressRouter, type LearningProgressStore, type LearningState } from "./learningProgress";
import { normalizeTutorResponse } from "./tutorResponse";

class InMemoryLearningProgressStore implements LearningProgressStore {
  private readonly states = new Map<string, LearningState>();

  async getState(learnerId: string): Promise<LearningState> {
    return structuredClone(this.states.get(learnerId) ?? {
      savedWords: [],
      learnedWords: [],
      quizAttempts: [],
      xp: 0,
    });
  }

  async saveWord(learnerId: string, word: string) {
    const state = await this.getState(learnerId);
    if (!state.savedWords.includes(word)) state.savedWords.push(word);
    this.states.set(learnerId, state);
    return this.getState(learnerId);
  }

  async unsaveWord(learnerId: string, word: string) {
    const state = await this.getState(learnerId);
    state.savedWords = state.savedWords.filter((saved) => saved !== word);
    this.states.set(learnerId, state);
    return this.getState(learnerId);
  }

  async setWordLearned(learnerId: string, word: string, learned: boolean) {
    const state = await this.getState(learnerId);
    state.learnedWords = learned
      ? [...new Set([...state.learnedWords, word])]
      : state.learnedWords.filter((learnedWord) => learnedWord !== word);
    this.states.set(learnerId, state);
    return this.getState(learnerId);
  }

  async recordQuizAttempt(learnerId: string, attempt: { quizId: string; answer: string; correct: boolean; xp: number }) {
    const state = await this.getState(learnerId);
    const earnedXp = attempt.correct ? attempt.xp : 0;
    state.quizAttempts.unshift({
      ...attempt,
      xp: earnedXp,
      attemptedOn: "2026-08-20",
    });
    state.xp += earnedXp;
    this.states.set(learnerId, state);
    return this.getState(learnerId);
  }
}

async function withApi(run: (request: (path: string, init?: RequestInit) => Promise<Response>) => Promise<void>) {
  const app: Express = express();
  app.use(express.json());
  app.use("/api", createLearningProgressRouter({
    store: new InMemoryLearningProgressStore(),
    getLearnerId: () => "learner-test",
  }));
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await run((path, init) => fetch(`http://127.0.0.1:${address.port}/api${path}`, init));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("learning progress API saves, unsaves, and toggles learned words", async () => {
  await withApi(async (request) => {
    const saved = await request("/learning/saved-words/bonjour", { method: "PUT" });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("cache-control"), "no-store");
    assert.equal(saved.headers.get("etag"), null);
    assert.deepEqual((await saved.json()).savedWords, ["bonjour"]);

    const savedAgain = await request("/learning/saved-words/bonjour", { method: "PUT" });
    assert.deepEqual((await savedAgain.json()).savedWords, ["bonjour"], "saving the same word remains idempotent");

    const learned = await request("/learning/words/bonjour", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ learned: true }),
    });
    assert.deepEqual((await learned.json()).learnedWords, ["bonjour"]);

    const unlearned = await request("/learning/words/bonjour", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ learned: false }),
    });
    assert.deepEqual((await unlearned.json()).learnedWords, []);

    const unsaved = await request("/learning/saved-words/bonjour", { method: "DELETE" });
    assert.deepEqual((await unsaved.json()).savedWords, []);
  });
});

test("learning progress API records attempts and persists only earned XP", async () => {
  await withApi(async (request) => {
    const correctAttempt = await request("/learning/quiz-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quizId: "daily-cafe", answer: "Je voudrais un café.", correct: true, xp: 20 }),
    });
    assert.deepEqual(await correctAttempt.json(), {
      savedWords: [],
      learnedWords: [],
      quizAttempts: [{
        quizId: "daily-cafe",
        answer: "Je voudrais un café.",
        correct: true,
        xp: 20,
        attemptedOn: "2026-08-20",
      }],
      xp: 20,
    });

    const incorrectAttempt = await request("/learning/quiz-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quizId: "daily-cafe", answer: "Je veux un café.", correct: false, xp: 20 }),
    });
    const state = await incorrectAttempt.json();
    assert.equal(state.xp, 20, "incorrect answers must not award duplicate XP");
    assert.equal(state.quizAttempts[0].xp, 0);

    const restored = await request("/learning/state");
    assert.equal(restored.headers.get("cache-control"), "no-store");
    assert.equal(restored.headers.get("etag"), null);
    assert.deepEqual(await restored.json(), state, "the persisted state is returned on a later reload");
  });
});

test("tutor feedback normalizes a single mistake before the response schema and session persistence path", () => {
  const normalized = normalizeTutorResponse({
    reply: "Très bien ! Continue comme ça.",
    explanation: "Use “je suis allé” for the past tense.",
    correction: "Je suis allé au marché.",
    naturalPhrase: null,
    mistakes: "Use “je suis allé” instead of “j'ai allé”.",
  });

  assert.deepEqual(SendTutorMessageResponse.parse(normalized), {
    reply: "Très bien ! Continue comme ça.",
    explanation: "Use “je suis allé” for the past tense.",
    correction: "Je suis allé au marché.",
    naturalPhrase: null,
    mistakes: ["Use “je suis allé” instead of “j'ai allé”."],
  });
});

test("tutor feedback converts an empty single mistake into no saved mistakes", () => {
  const normalized = normalizeTutorResponse({
    reply: "Bravo !",
    explanation: "No corrections needed.",
    correction: null,
    naturalPhrase: null,
    mistakes: "   ",
  });

  assert.deepEqual((normalized as { mistakes: string[] }).mistakes, []);
});