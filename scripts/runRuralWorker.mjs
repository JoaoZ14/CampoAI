import "dotenv/config";
import { runRuralWorker } from "../src/jobs/ruralWorker.js";
await runRuralWorker();
