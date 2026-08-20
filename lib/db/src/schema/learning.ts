import { boolean, date, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const savedWordsTable = pgTable(
  "saved_words",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    learnerId: text("learner_id").notNull(),
    word: text("word").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("saved_words_learner_word_unique").on(table.learnerId, table.word)],
);

export const learnedWordsTable = pgTable(
  "learned_words",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    learnerId: text("learner_id").notNull(),
    word: text("word").notNull(),
    learned: boolean("learned").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("learned_words_learner_word_unique").on(table.learnerId, table.word)],
);

export const quizAttemptsTable = pgTable(
  "quiz_attempts",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    learnerId: text("learner_id").notNull(),
    quizId: text("quiz_id").notNull(),
    answer: text("answer").notNull(),
    correct: boolean("correct").notNull(),
    xp: integer("xp").notNull().default(0),
    attemptedOn: date("attempted_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const learnerStatsTable = pgTable("learner_stats", {
  learnerId: text("learner_id").primaryKey(),
  xp: integer("xp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningSessionsTable = pgTable("learning_sessions", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  learnerId: text("learner_id").notNull(),
  activity: text("activity").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const recurringMistakesTable = pgTable(
  "recurring_mistakes",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    learnerId: text("learner_id").notNull(),
    pattern: text("pattern").notNull(),
    explanation: text("explanation").notNull(),
    count: integer("count").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("recurring_mistakes_learner_pattern_unique").on(table.learnerId, table.pattern)],
);

export type SavedWord = typeof savedWordsTable.$inferSelect;
export type LearnedWord = typeof learnedWordsTable.$inferSelect;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
export type LearningSession = typeof learningSessionsTable.$inferSelect;
export type RecurringMistake = typeof recurringMistakesTable.$inferSelect;