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
  SendTutorMessageBody,
  SendTutorMessageResponse,
  GetTutorMistakesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, learnedWordsTable, learnerStatsTable, learningSessionsTable, quizAttemptsTable, recurringMistakesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { createLearningProgressRouter } from "./learningProgress";
import { learningProgressStore } from "./learningProgressStore";
import { normalizeTutorResponse } from "./tutorResponse";
import { findDictionaryEntry, searchDictionary } from "./dictionarySearch";

const router: IRouter = Router();
type AuthenticatedRequest = Request & { userId?: string };
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = getAuth(req).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
  return undefined;
};

router.use(createLearningProgressRouter({
  store: learningProgressStore,
  getLearnerId: (req) => getAuth(req).userId,
}));

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
    word: "lundi",
    translation: "Monday",
    definition: "The first day of the working week in France and many French-speaking places.",
    partOfSpeech: "noun",
    gender: "masculine",
    pronunciation: "luhn-dee",
    level: "A1 · Beginner",
    examples: ["Lundi, je commence mon cours de français.", "Le magasin est fermé le lundi."],
    related: ["mardi", "semaine", "week-end"],
  },
  {
    word: "maison",
    translation: "house, home",
    definition: "The place where someone lives; it can also mean the building itself.",
    partOfSpeech: "noun",
    gender: "feminine",
    pronunciation: "meh-zohn",
    level: "A1 · Beginner",
    examples: ["Je rentre à la maison.", "Notre maison est près du parc."],
    related: ["appartement", "famille", "chez"],
  },
  {
    word: "famille",
    translation: "family",
    definition: "A group of people related to one another, or the people close to you at home.",
    partOfSpeech: "noun",
    gender: "feminine",
    pronunciation: "fah-mee",
    level: "A1 · Beginner",
    examples: ["Ma famille habite à Lyon.", "Je passe le dimanche avec ma famille."],
    related: ["parents", "enfant", "frère"],
  },
  {
    word: "eau",
    translation: "water",
    definition: "The clear liquid that people drink and that covers much of the Earth.",
    partOfSpeech: "noun",
    gender: "feminine",
    pronunciation: "oh",
    level: "A1 · Beginner",
    examples: ["Je voudrais un verre d'eau.", "L'eau est fraîche."],
    related: ["boire", "verre", "soif"],
  },
  {
    word: "café",
    translation: "coffee; café",
    definition: "A hot drink made from roasted coffee beans, or a small place where drinks and food are served.",
    partOfSpeech: "noun",
    gender: "masculine",
    pronunciation: "kah-fay",
    level: "A1 · Beginner",
    examples: ["Je prends un café le matin.", "On se retrouve dans un café."],
    related: ["boire", "matin", "restaurant"],
  },
  {
    word: "manger",
    translation: "to eat",
    definition: "To put food in your mouth and swallow it.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "mahn-zhay",
    level: "A1 · Beginner",
    examples: ["Nous allons manger ensemble.", "Qu'est-ce que tu veux manger ?"],
    related: ["repas", "déjeuner", "faim"],
  },
  {
    word: "boire",
    translation: "to drink",
    definition: "To take a liquid into your mouth and swallow it.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "bwahr",
    level: "A1 · Beginner",
    examples: ["Je bois beaucoup d'eau.", "Vous voulez boire quelque chose ?"],
    related: ["eau", "café", "soif"],
  },
  {
    word: "aujourd'hui",
    translation: "today",
    definition: "On this day; the day that is happening now.",
    partOfSpeech: "adverb",
    gender: null,
    pronunciation: "oh-zhoor-dwee",
    level: "A1 · Beginner",
    examples: ["Aujourd'hui, il fait beau.", "Je travaille aujourd'hui."],
    related: ["demain", "hier", "maintenant"],
  },
  {
    word: "français",
    translation: "French",
    definition: "Relating to France or its people, or the language spoken in France and many other places.",
    partOfSpeech: "adjective · noun",
    gender: "masculine",
    pronunciation: "frahn-say",
    level: "A1 · Beginner",
    examples: ["J'apprends le français.", "C'est un film français."],
    related: ["France", "langue", "apprendre"],
  },
  {
    word: "travailler",
    translation: "to work",
    definition: "To do a job or spend time doing a task or activity.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "trah-vah-yay",
    level: "A1 · Beginner",
    examples: ["Je travaille dans une école.", "Nous travaillons le lundi."],
    related: ["emploi", "bureau", "étudier"],
  },
  {
    word: "comprendre",
    translation: "to understand",
    definition: "To know the meaning of something or see how something works.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "kohm-prahn-druh",
    level: "A1 · Beginner",
    examples: ["Je comprends la question.", "Elle comprend mieux avec un exemple."],
    related: ["apprendre", "expliquer", "question"],
  },
  {
    word: "besoin",
    translation: "need",
    definition: "Something that is necessary or wanted; commonly used in the expression avoir besoin de.",
    partOfSpeech: "noun",
    gender: "masculine",
    pronunciation: "buh-zwan",
    level: "A2 · Elementary",
    examples: ["J'ai besoin d'un peu de temps.", "De quoi as-tu besoin ?"],
    related: ["vouloir", "aide", "devoir"],
  },
  {
    word: "prendre",
    translation: "to take",
    definition: "To get hold of something, carry it, or choose and consume something such as a meal or drink.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "prahn-druh",
    level: "A2 · Elementary",
    examples: ["Je prends le train à huit heures.", "Tu prends un café ?"],
    related: ["aller", "choisir", "voyage"],
  },
  {
    word: "pouvoir",
    translation: "can, to be able to",
    definition: "To have the ability or permission to do something.",
    partOfSpeech: "verb",
    gender: null,
    pronunciation: "poo-vwahr",
    level: "A2 · Elementary",
    examples: ["Je peux vous aider.", "Est-ce que tu peux venir demain ?"],
    related: ["devoir", "vouloir", "aider"],
  },
  {
    word: "toujours",
    translation: "always; still",
    definition: "At all times, or continuing up to the present moment depending on the context.",
    partOfSpeech: "adverb",
    gender: null,
    pronunciation: "too-zhoor",
    level: "A2 · Elementary",
    examples: ["Elle arrive toujours à l'heure.", "Il est toujours au travail."],
    related: ["souvent", "jamais", "encore"],
  },
  {
    word: "souvent",
    translation: "often",
    definition: "Many times or frequently.",
    partOfSpeech: "adverb",
    gender: null,
    pronunciation: "soo-vahn",
    level: "A2 · Elementary",
    examples: ["Je lis souvent le soir.", "Nous voyageons souvent en train."],
    related: ["toujours", "parfois", "rarement"],
  },
  {
    word: "cependant",
    translation: "however, nevertheless",
    definition: "A formal linking word used to introduce a contrast or an exception.",
    partOfSpeech: "adverb",
    gender: null,
    pronunciation: "suh-pahn-dahn",
    level: "B1 · Intermediate",
    examples: ["Le trajet est long ; cependant, la vue est magnifique.", "Je comprends cependant ton point de vue."],
    related: ["pourtant", "mais", "toutefois"],
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
  const result = searchDictionary(dictionary, q);
  res.json(SearchDictionaryResponse.parse(result));
});

router.get("/dictionary/:word", (req, res) => {
  const entry = findDictionaryEntry(dictionary, req.params.word);
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
  const [learned, stats, attempts, recent, sessions] = await Promise.all([
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable).where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))),
    db.select({ xp: learnerStatsTable.xp }).from(learnerStatsTable).where(eq(learnerStatsTable.learnerId, learnerId)).limit(1),
    db.select({ attemptedOn: quizAttemptsTable.attemptedOn, correct: quizAttemptsTable.correct }).from(quizAttemptsTable).where(eq(quizAttemptsTable.learnerId, learnerId)).orderBy(desc(quizAttemptsTable.createdAt)),
    db.select({ word: learnedWordsTable.word }).from(learnedWordsTable).where(and(eq(learnedWordsTable.learnerId, learnerId), eq(learnedWordsTable.learned, true))).orderBy(desc(learnedWordsTable.updatedAt)).limit(4),
    db.select({
      activity: learningSessionsTable.activity,
      startedAt: learningSessionsTable.startedAt,
      completedAt: learningSessionsTable.completedAt,
    }).from(learningSessionsTable)
      .where(eq(learningSessionsTable.learnerId, learnerId))
      .orderBy(desc(sql`coalesce(${learningSessionsTable.completedAt}, ${learningSessionsTable.startedAt})`))
      .limit(8),
  ]);
  const xp = stats[0]?.xp ?? 0;
  const level = xp >= 3000 ? "B1 · Builder" : xp >= 1500 ? "A2 · Explorer" : "A1 · Starter";
  const dates = new Set(attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.attemptedOn));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  res.set("Cache-Control", "no-store");
  return res.json(GetDashboardResponse.parse({
    wordsLearned: learned.length,
    streak,
    xp,
    level,
    progress: xp % 100,
    weakSpot: attempts.filter((attempt) => !attempt.correct).length ? "Past tense" : "Keep exploring",
    recentWords: recent.map(({ word }) => word),
    recentActivity: sessions.map(({ activity, startedAt, completedAt }) => ({
      activity,
      completedAt: (completedAt ?? startedAt).toISOString(),
    })),
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
          content: `You are a precise English/French translator for Frenchami learners. ${directionInstruction} Return ONLY valid JSON with exactly two string fields: "translation" and "note".`,
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

router.post("/tutor/message", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const input = SendTutorMessageBody.parse(req.body);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `You are a warm French conversation tutor. The learner is ${input.level} level. Reply mostly in French, then explain in clear English. Return JSON with exactly these keys: reply, explanation, correction, naturalPhrase, mistakes. Correct grammar kindly and keep the conversation moving. Do not mention being an AI.` },
      ...input.history.map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
      { role: "user", content: input.message },
    ],
  });
  const raw = completion.choices[0]?.message.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    res.status(502).json({ error: "Tutor returned an invalid response" });
    return;
  }
  const parsedTutorResponse = SendTutorMessageResponse.safeParse(normalizeTutorResponse(parsed));
  if (!parsedTutorResponse.success) {
    req.log.error({ issues: parsedTutorResponse.error.issues }, "Tutor returned an invalid response");
    res.status(502).json({ error: "Tutor returned an invalid response" });
    return;
  }

  const tutorResponse = parsedTutorResponse.data;
  await Promise.all(tutorResponse.mistakes.map(async (pattern) => {
    await db.insert(recurringMistakesTable).values({
      learnerId: req.userId!, pattern, explanation: tutorResponse.explanation, count: 1, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [recurringMistakesTable.learnerId, recurringMistakesTable.pattern],
      set: { count: sql`${recurringMistakesTable.count} + 1`, explanation: tutorResponse.explanation, lastSeenAt: new Date() },
    });
  }));
  await db.insert(learningSessionsTable).values({ learnerId: req.userId!, activity: `tutor-${input.level}`, completedAt: new Date() });
  res.json(tutorResponse);
});

router.get("/tutor/mistakes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const mistakes = await db.select({
    pattern: recurringMistakesTable.pattern,
    explanation: recurringMistakesTable.explanation,
    count: recurringMistakesTable.count,
    lastSeenAt: recurringMistakesTable.lastSeenAt,
  }).from(recurringMistakesTable).where(eq(recurringMistakesTable.learnerId, req.userId!))
    .orderBy(desc(recurringMistakesTable.count), desc(recurringMistakesTable.lastSeenAt));
  res.json(GetTutorMistakesResponse.parse(mistakes));
});

export default router;
