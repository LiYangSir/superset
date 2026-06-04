import { cpus } from "node:os";
import { join } from "node:path";
import {
	type WorkerTaskOptions,
	WorkerTaskRunner,
} from "../../../workers/WorkerTaskRunner";
import type {
	GitTaskPayloadMap,
	GitTaskResultMap,
	GitTaskType,
} from "./git-task-types";

const WORKER_COUNT = Math.max(1, Math.min(4, cpus().length - 1));
const WORKER_DEBUG = process.env.SUPERSET_WORKER_DEBUG === "1";

let gitTaskRunner: WorkerTaskRunner | null = null;
let didRegisterDisposeHook = false;

function getWorkerScriptPath(): string {
	return join(process.cwd(), "dist", "main", "git-task-worker.js");
}

function getRunner(): WorkerTaskRunner {
	if (!gitTaskRunner) {
		gitTaskRunner = new WorkerTaskRunner({
			workerScriptPath: getWorkerScriptPath(),
			concurrency: WORKER_COUNT,
			name: "changes-git",
			debug: WORKER_DEBUG,
		});

		if (!didRegisterDisposeHook) {
			// TODO: implement with Tauri API — register a dispose hook on app quit
			didRegisterDisposeHook = true;
		}
	}
	return gitTaskRunner;
}

export function runGitTask<TTask extends GitTaskType>(
	taskType: TTask,
	payload: GitTaskPayloadMap[TTask],
	options?: WorkerTaskOptions,
): Promise<GitTaskResultMap[TTask]> {
	return getRunner().runTask<GitTaskResultMap[TTask]>(
		taskType,
		payload,
		options,
	);
}
