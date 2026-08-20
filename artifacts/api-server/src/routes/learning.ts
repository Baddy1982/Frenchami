import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import {
  GetDailyQuizResponse,
  GetDashboardResponse,
  GetDictionaryEntryResponse,
  GetVerbResponse,
  GetVocabularyResponse,
  ListVocabularyCategoriesResponse,
  SearchDictionaryQueryParams,
  SearchDictionaryResponse,
  TranslateTextBody,
  TranslateTextResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, learnedWordsTable, learnerStatsTable, learningSessionsTable, quizAttemptsTable, savedWordsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();
type AuthenticatedRequest = Request & { userId?: string };
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = getAuth(req).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
  return undefined;
};

const normalizeDictionarySearch = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/[’]/g, "'")
  .trim()
  .toLowerCase();

const dictionary = [
  {
    word: "bonjour",
    translation: "hello, good morning",
    definition: "A polite greeting used during the day.",
    partOfSpeech: "interjection",
    gender: null,
    pronunciation: "bohn-zhoor",
    level: "A1 · Beginner",
    examples: ["Bonjour, comment allez-vous ?", "Bonjour tout le monde !"],
    related: ["salut", "bonsoir", "bonne journée"],
  },
  {
    word: "salut",
    translation: "hi, hello; bye",
    definition: "An informal greeting or farewell used with friends, family, and people you know well.",
    partOfSpeech: "interjection",
    gender: null,
    pronunciation: "sah-loo",
    level: "A1 · Beginner",
    examples: ["Salut, ça va ?", "Salut, à demain !"],
    related: ["bonjour", "coucou", "à bientôt"],
  },
  {
    word: "voudrais",
    translation: "would like",
    definition: "First-person singular conditional of vouloir, used to make a polite request.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "voo-dreh",
    level: "A2 · Elementary",
    examples: ["Je voudrais un café, s'il vous plaît.", "Je voudrais réserver une table."],
    related: ["vouloir", "aimerais", "demander"],
  },
  {
    word: "chouette",
    translation: "great, cool; owl",
    definition: "An informal adjective meaning pleasant or nice. It can also mean an owl.",
    partOfSpeech: "adjective · noun",
    gender: "feminine",
    pronunciation: "shwet",
    level: "A2 · Elementary",
    examples: ["C'est une chouette idée !", "J'ai vu une chouette dans le jardin."],
    related: ["super", "génial", "sympa"],
  },
  {
    word: "apprendre",
    translation: "to learn",
    definition: "To acquire knowledge or a new skill through study or experience.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "ah-pron-druh",
    level: "A1 · Beginner",
    examples: ["J'apprends le français.", "Elle apprend vite."],
    related: ["étudier", "comprendre", "enseignement"],
  },
  {
    word: "bravo",
    translation: "well done, bravo",
    definition: "An expression of praise or approval, used to congratulate someone.",
    partOfSpeech: "interjection",
    gender: null,
    pronunciation: "brah-voh",
    level: "A1 · Beginner",
    examples: ["Bravo, tu as réussi !", "Bravo pour ton excellent travail."],
    related: ["félicitations", "bien joué", "super"],
  },
  {
    word: "retrouver",
    translation: "to find again, meet again",
    definition: "To find something again or to meet someone again after being apart.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "ruh-troo-vay",
    level: "A2 · Elementary",
    examples: ["Je veux retrouver mes clés.", "On se retrouve demain ?"],
    related: ["trouver", "revoir", "chercher"],
  },
  {
    word: "chemin",
    translation: "path, way",
    definition: "A path, route, or the way to get somewhere.",
    partOfSpeech: "noun",
    gender: "masculine",
    pronunciation: "shuh-man",
    level: "A1 · Beginner",
    examples: ["Le chemin est long.", "C'est le chemin de la gare."],
    related: ["route", "rue", "direction"],
  },
  {
    word: "se débrouiller",
    translation: "to manage, get by",
    definition: "To cope with a situation or manage without much help.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "suh day-broo-yay",
    level: "A2 · Elementary",
    examples: ["Je me débrouille en français.", "Elle se débrouille très bien seule."],
    related: ["réussir", "gérer", "s'en sortir"],
  },
  {
    word: "pourtant",
    translation: "however, yet",
    definition: "A linking word that introduces a contrast with what was just said.",
    partOfSpeech: "adverb",
    gender: null,
    pronunciation: "poor-tahn",
    level: "B1 · Intermediate",
    examples: ["Il pleut, pourtant je sors.", "C'est pourtant très simple."],
    related: ["cependant", "mais", "toutefois"],
  },
  {
    word: "à bientôt",
    translation: "see you soon",
    definition: "A friendly way to say goodbye when you expect to see someone again soon.",
    partOfSpeech: "expression",
    gender: null,
    pronunciation: "ah byan-toh",
    level: "A1 · Beginner",
    examples: ["Merci pour ton aide, à bientôt !", "À bientôt, j'espère."],
    related: ["au revoir", "à demain", "salut"],
  },
];

const categories = [
  { slug: "beginner", name: "Beginner French", description: "Your first 100 essential words", wordCount: 120, color: "sun" },
  { slug: "travel", name: "Travel", description: "Navigate cafés, trains, and new cities", wordCount: 84, color: "sky" },
  { slug: "food", name: "Food & dining", description: "Order with confidence and enjoy every bite", wordCount: 96, color: "coral" },
  { slug: "quebec", name: "Canadian French", description: "Expressions from Montréal and beyond", wordCount: 62, color: "violet" },
];

const vocabulary = {
  beginner: [
    { word: "merci", translation: "thank you", pronunciation: "mehr-see", example: "Merci beaucoup pour votre aide.", learned: true },
    { word: "s'il vous plaît", translation: "please", pronunciation: "seel voo pleh", example: "Un verre d'eau, s'il vous plaît.", learned: true },
    { word: "excusez-moi", translation: "excuse me", pronunciation: "ex-koo-zay mwah", example: "Excusez-moi, où est la gare ?", learned: false },
  ],
  travel: [
    { word: "la gare", translation: "train station", pronunciation: "lah gahr", example: "La gare est à cinq minutes.", learned: false },
    { word: "un billet", translation: "a ticket", pronunciation: "uhn bee-yay", example: "Je voudrais un billet pour Lyon.", learned: false },
    { word: "à gauche", translation: "to the left", pronunciation: "ah gosh", example: "Tournez à gauche après le pont.", learned: false },
  ],
  food: [
    { word: "l'addition", translation: "the bill", pronunciation: "lah-dee-see-ohn", example: "L'addition, s'il vous plaît.", learned: true },
    { word: "délicieux", translation: "delicious", pronunciation: "day-lee-syuh", example: "Ce dessert est délicieux.", learned: false },
    { word: "sans", translation: "without", pronunciation: "sahn", example: "Un café sans sucre, merci.", learned: false },
  ],
  quebec: [
    { word: "magasiner", translation: "to shop", pronunciation: "mah-gah-zee-nay", example: "On va magasiner samedi.", learned: false },
    { word: "char", translation: "car", pronunciation: "shar", example: "J'ai laissé mon char dehors.", learned: false },
  ],
} as const;

const verbs = {
  être: {
    verb: "être", translation: "to be", group: "Irregular", tenses: [
      { name: "Présent", forms: ["je suis", "tu es", "il / elle est", "nous sommes", "vous êtes", "ils / elles sont"], example: "Je suis ravi de te rencontrer." },
      { name: "Passé composé", forms: ["j'ai été", "tu as été", "il / elle a été", "nous avons été", "vous avez été", "ils / elles ont été"], example: "Nous avons été très heureux." },
      { name: "Imparfait", forms: ["j'étais", "tu étais", "il / elle était", "nous étions", "vous étiez", "ils / elles étaient"], example: "Quand j'étais petit, je lisais beaucoup." },
      { name: "Futur simple", forms: ["je serai", "tu seras", "il / elle sera", "nous serons", "vous serez", "ils / elles seront"], example: "Je serai là demain." },
    ],
  },
  avoir: {
    verb: "avoir", translation: "to have", group: "Irregular", tenses: [
      { name: "Présent", forms: ["j'ai", "tu as", "il / elle a", "nous avons", "vous avez", "ils / elles ont"], example: "J'ai une question." },
      { name: "Passé composé", forms: ["j'ai eu", "tu as eu", "il / elle a eu", "nous avons eu", "vous avez eu", "ils / elles ont eu"], example: "Elle a eu une bonne idée." },
      { name: "Imparfait", forms: ["j'avais", "tu avais", "il / elle avait", "nous avions", "vous aviez", "ils / elles avaient"], example: "Nous avions beaucoup de temps." },
      { name: "Futur simple", forms: ["j'aurai", "tu auras", "il / elle aura", "nous aurons", "vous aurez", "ils / elles auront"], example: "Tu auras ta réponse bientôt." },
    ],
  },
  parler: {
    verb: "parler", translation: "to speak", group: "First group", tenses: [
      { name: "Présent", forms: ["je parle", "tu parles", "il / elle parle", "nous parlons", "vous parlez", "ils / elles parlent"], example: "Je parle un peu français." },
      { name: "Passé composé", forms: ["j'ai parlé", "tu as parlé", "il / elle a parlé", "nous avons parlé", "vous avez parlé", "ils / elles ont parlé"], example: "On a parlé de cinéma." },
      { name: "Imparfait", forms: ["je parlais", "tu parlais", "il / elle parlait", "nous parlions", "vous parliez", "ils / elles parlaient"], example: "Ils parlaient très doucement." },
      { name: "Futur simple", forms: ["je parlerai", "tu parleras", "il / elle parlera", "nous parlerons", "vous parlerez", "ils / elles parleront"], example: "Nous parlerons demain." },
    ],
  },
} as const;

router.get("/dictionary", (req, res) => {
  const { q } = SearchDictionaryQueryParams.parse(req.query);
  const normalizedQuery = normalizeDictionarySearch(q);
  const result = dictionary.filter((entry) => normalizeDictionarySearch([
    entry.word,
    entry.translation,
    entry.definition,
    ...entry.examples,
    ...entry.related,
  ].join(" ")).includes(normalizedQuery));
  res.json(SearchDictionaryResponse.parse(result));
});

router.get("/dictionary/:word", (req, res) => {
  const entry = dictionary.find((item) => normalizeDictionarySearch(item.word) === normalizeDictionarySearch(req.params.word));
  if (!entry) return res.status(404).json({ error: "Word not found" });
  return res.json(GetDictionaryEntryResponse.parse(entry));
});

router.get("/verbs/:verb", (req, res) => {
  const entry = verbs[req.params.verb.toLowerCase() as keyof typeof verbs] ?? verbs.être;
  return res.json(GetVerbResponse.parse(entry));
});

router.get("/vocabulary/categories", (_req, res) => res.json(ListVocabularyCategoriesResponse.parse(categories)));
router.get("/vocabulary/:category", (req, res) => {
  const words = vocabulary[req.params.category as keyof typeof vocabulary] ?? vocabulary.beginner;
  return res.json(GetVocabularyResponse.parse(words));
});

router.get("/quiz/daily", (_req, res) => res.json(GetDailyQuizResponse.parse({
  title: "A quick café conversation",
  question: "How would you politely order a coffee?",
  options: ["Je veux un café.", "Je voudrais un café.", "J'ai un café.", "Je suis un café."],
  answer: "Je voudrais un café.",
  xp: 20,
})));

router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  const learnerId = req.userId!;
  const [learned, stats, attempts, recent] = await Promise.all([
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable).where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))),
    db.select({ xp: learnerStatsTable.xp }).from(learnerStatsTable).where(eq(learnerStatsTable.learnerId, learnerId)).limit(1),
    db.select({ attemptedOn: quizAttemptsTable.attemptedOn, correct: quizAttemptsTable.correct }).from(quizAttemptsTable).where(eq(quizAttemptsTable.learnerId, learnerId)).orderBy(desc(quizAttemptsTable.createdAt)),
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable).where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))).orderBy(desc(learnedWordsTable.updatedAt)).limit(4),
  ]);
  const xp = stats[0]?.xp ?? 0;
  const level = xp >= 3000 ? "B1 · Builder" : xp >= 1500 ? "A2 · Explorer" : "A1 · Starter";
  const dates = new Set(attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.attemptedOn));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return res.json(GetDashboardResponse.parse({
    wordsLearned: learned.length,
    streak,
    xp,
    level,
    progress: xp % 100,
    weakSpot: attempts.filter((attempt) => !attempt.correct).length ? "Past tense" : "Keep exploring",
    recentWords: recent.map(({ word }) => word),
  }));
});

router.post("/translate", async (req, res) => {
  const input = TranslateTextBody.parse(req.body);
  const directionInstruction = input.direction === "auto"
    ? "Detect whether the input is English or French, then translate it into the other language."
    : input.direction === "en-fr"
      ? "Translate from English to French."
      : "Translate from French to English.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: `You are a precise English/French translator for Frenchami learners. ${directionInstruction} Translate the entire input naturally and preserve its intended register. Never return the original input unchanged unless it is a genuinely untranslatable proper name or technical term. Return ONLY valid JSON with exactly two string fields: "translation" and "note". The note must be one short English sentence explaining an idiom, politeness, grammar difference, or notable word choice when helpful; otherwise say "Natural everyday phrasing."`,
        },
        { role: "user", content: input.text },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const json = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    res.json(TranslateTextResponse.parse(JSON.parse(json)));
  } catch (error) {
    req.log.error({ err: error }, "Translation request failed");
    res.status(502).json({ error: "Translation is temporarily unavailable. Please try again." });
  }
});

router.get("/learning/state", requireAuth, async (req: AuthenticatedRequest, res) => {
  return res.json(await getLearningState(req.userId!));
});

router.put("/learning/saved-words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
  const word = String(req.params.word);
  await db.insert(savedWordsTable).values({ learnerId: req.userId!, word })
    .onConflictDoNothing({ target: [savedWordsTable.learnerId, savedWordsTable.word] });
  return res.json(await getLearningState(req.userId!));
});

router.delete("/learning/saved-words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
  const word = String(req.params.word);
  await db.delete(savedWordsTable).where(and(eq(savedWordsTable.learnerId, req.userId!), eq(savedWordsTable.word, word)));
  return res.json(await getLearningState(req.userId!));
});

router.patch("/learning/words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
  const word = String(req.params.word);
  const learned = Boolean(req.body?.learned);
  await db.insert(learnedWordsTable).values({ learnerId: req.userId!, word, learned })
    .onConflictDoUpdate({
      target: [learnedWordsTable.learnerId, learnedWordsTable.word],
      set: { learned, updatedAt: new Date() },
    });
  return res.json(await getLearningState(req.userId!));
});

router.post("/learning/quiz-attempts", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { quizId, answer, correct, xp } = req.body;
  const earnedXp = correct ? xp : 0;
  await db.transaction(async (tx) => {
    await tx.insert(quizAttemptsTable).values({
      learnerId: req.userId!, quizId, answer, correct, xp: earnedXp,
      attemptedOn: new Date().toISOString().slice(0, 10),
    });
    await tx.insert(learnerStatsTable).values({ learnerId: req.userId!, xp: earnedXp })
      .onConflictDoUpdate({
        target: learnerStatsTable.learnerId,
        set: { xp: sql`${learnerStatsTable.xp} + ${earnedXp}`, updatedAt: new Date() },
      });
    await tx.insert(learningSessionsTable).values({
      learnerId: req.userId!,
      activity: "daily-quiz",
      completedAt: new Date(),
    });
  });
  return res.json(await getLearningState(req.userId!));
});

export default router;

async function getLearningState(learnerId: string) {
  const [saved, learned, attempts, stats] = await Promise.all([
    db.select({ word: savedWordsTable.word }).from(savedWordsTable).where(eq(savedWordsTable.learnerId, learnerId)),
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable)
      .where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))),
    db.select({
      quizId: quizAttemptsTable.quizId, answer: quizAttemptsTable.answer, correct: quizAttemptsTable.correct,
      xp: quizAttemptsTable.xp, attemptedOn: quizAttemptsTable.attemptedOn,
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