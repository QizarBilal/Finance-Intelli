import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import transactionsRouter from "./transactions";
import categoriesRouter from "./categories";
import budgetsRouter from "./budgets";
import goalsRouter from "./goals";
import remindersRouter from "./reminders";
import dashboardRouter from "./dashboard";
import analyticsRouter from "./analytics";
import insightsRouter from "./insights";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(transactionsRouter);
router.use(categoriesRouter);
router.use(budgetsRouter);
router.use(goalsRouter);
router.use(remindersRouter);
router.use(dashboardRouter);
router.use(analyticsRouter);
router.use(insightsRouter);

export default router;
