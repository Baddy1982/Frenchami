import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learningRouter from "./learning";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(learningRouter);
router.use(billingRouter);

export default router;
