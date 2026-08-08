import { Router } from "express";
import healthRouter from "./health";
import mongoRouter from "./mongo";

const router = Router();

router.use(healthRouter);
router.use(mongoRouter);

export default router;
