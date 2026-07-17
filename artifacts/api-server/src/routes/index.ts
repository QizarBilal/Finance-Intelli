import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import categoriesRouter from "./categories";
import transactionsRouter from "./transactions";
import budgetsRouter from "./budgets";
import goalsRouter from "./goals";
import remindersRouter from "./reminders";
import dashboardRouter from "./dashboard";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(categoriesRouter);
router.use(transactionsRouter);
router.use(budgetsRouter);
router.use(goalsRouter);
router.use(remindersRouter);
router.use(dashboardRouter);
router.use(analyticsRouter);

export default router;
