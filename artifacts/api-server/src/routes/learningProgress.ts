import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

export interface LearningState {
  savedWords: string[];
  learnedWords: string[];
  quizAttempts: Array<{
    quizId: string;
    answer: string;
    correct: boolean;
    xp: number;
    attemptedOn: string;
  }>;
  xp: number;
}

export interface LearningProgressStore {
  getState(learnerId: string): Promise<LearningState>;
  saveWord(learnerId: string, word: string): Promise<LearningState>;
  unsaveWord(learnerId: string, word: string): Promise<LearningState>;
  setWordLearned(learnerId: string, word: string, learned: boolean): Promise<LearningState>;
  recordQuizAttempt(
    learnerId: string,
    attempt: { quizId: string; answer: string; correct: boolean; xp: number },
  ): Promise<LearningState>;
}

type LearnerIdResolver = (req: Request) => string | null;
type AuthenticatedRequest = Request & { learnerId?: string };

function sendLearningState(res: Response, state: LearningState) {
  res.status(200);
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json");
  res.removeHeader("ETag");
  return res.end(JSON.stringify(state));
}

export function createLearningProgressRouter({
  store,
  getLearnerId,
}: {
  store: LearningProgressStore;
  getLearnerId: LearnerIdResolver;
}): IRouter {
  const router: IRouter = Router();
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const learnerId = getLearnerId(req);
    if (!learnerId) return res.status(401).json({ error: "Unauthorized" });
    req.learnerId = learnerId;
    next();
    return undefined;
  };

  router.get("/learning/state", requireAuth, async (req: AuthenticatedRequest, res) => {
    return sendLearningState(res, await store.getState(req.learnerId!));
  });

  router.put("/learning/saved-words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
    return sendLearningState(res, await store.saveWord(req.learnerId!, String(req.params.word)));
  });

  router.delete("/learning/saved-words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
    return sendLearningState(res, await store.unsaveWord(req.learnerId!, String(req.params.word)));
  });

  router.patch("/learning/words/:word", requireAuth, async (req: AuthenticatedRequest, res) => {
    return sendLearningState(res, await store.setWordLearned(req.learnerId!, String(req.params.word), Boolean(req.body?.learned)));
  });

  router.post("/learning/quiz-attempts", requireAuth, async (req: AuthenticatedRequest, res) => {
    const { quizId, answer, correct, xp } = req.body;
    return sendLearningState(res, await store.recordQuizAttempt(req.learnerId!, { quizId, answer, correct, xp }));
  });

  return router;
}