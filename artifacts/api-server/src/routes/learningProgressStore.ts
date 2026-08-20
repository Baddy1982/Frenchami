import {
  db,
  learnedWordsTable,
  learnerStatsTable,
  learningSessionsTable,
  quizAttemptsTable,
  savedWordsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { LearningProgressStore, LearningState } from "./learningProgress";

async function getLearningState(learnerId: string): Promise<LearningState> {
  const [saved, learned, attempts, stats] = await Promise.all([
    db.select({ word: savedWordsTable.word }).from(savedWordsTable).where(eq(savedWordsTable.learnerId, learnerId)),
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable)
      .where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))),
    db.select({
      quizId: quizAttemptsTable.quizId,
      answer: quizAttemptsTable.answer,
      correct: quizAttemptsTable.correct,
      xp: quizAttemptsTable.xp,
      attemptedOn: quizAttemptsTable.attemptedOn,
    }).from(quizAttemptsTable).where(eq(quizAttemptsTable.learnerId, learnerId))
      .orderBy(desc(quizAttemptsTable.createdAt)),
    db.select({ xp: learnerStatsTable.xp }).from(learnerStatsTable)
      .where(eq(learnerStatsTable.learnerId, learnerId)).limit(1),
  ]);

  return {
    savedWords: saved.map(({ word }) => word),
    learnedWords: learned.map(({ word }) => word),
    quizAttempts: attempts,
    xp: stats[0]?.xp ?? 0,
  };
}

export const learningProgressStore: LearningProgressStore = {
  getState: getLearningState,

  async saveWord(learnerId, word) {
    await db.insert(savedWordsTable).values({ learnerId, word }).onConflictDoNothing();
    return getLearningState(learnerId);
  },

  async unsaveWord(learnerId, word) {
    await db.delete(savedWordsTable).where(and(eq(savedWordsTable.learnerId, learnerId), eq(savedWordsTable.word, word)));
    return getLearningState(learnerId);
  },

  async setWordLearned(learnerId, word, learned) {
    await db.insert(learnedWordsTable).values({ learnerId, word, learned })
      .onConflictDoUpdate({
        target: [learnedWordsTable.learnerId, learnedWordsTable.word],
        set: { learned, updatedAt: new Date() },
      });
    return getLearningState(learnerId);
  },

  async recordQuizAttempt(learnerId, { quizId, answer, correct, xp }) {
    const earnedXp = correct ? xp : 0;
    await db.transaction(async (tx) => {
      await tx.insert(quizAttemptsTable).values({
        learnerId,
        quizId,
        answer,
        correct,
        xp: earnedXp,
        attemptedOn: new Date().toISOString().slice(0, 10),
      });
      await tx.insert(learnerStatsTable).values({ learnerId, xp: earnedXp })
        .onConflictDoUpdate({
          target: learnerStatsTable.learnerId,
          set: { xp: sql`${learnerStatsTable.xp} + ${earnedXp}`, updatedAt: new Date() },
        });
      await tx.insert(learningSessionsTable).values({ learnerId, activity: "daily-quiz", completedAt: new Date() });
    });
    return getLearningState(learnerId);
  },
};