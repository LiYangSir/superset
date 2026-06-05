import { router } from "../..";
import { createGitBackupProcedures } from "./procedures/git-backup";
import { createMarketplaceProcedures } from "./procedures/marketplace";
import { createPresetsProcedures } from "./procedures/presets";
import { createSkillsProcedures } from "./procedures/skills";
import { createSyncProcedures } from "./procedures/sync";
import { createToolsProcedures } from "./procedures/tools";

export const createSkillsRouter = () => {
	return router({
		...createSkillsProcedures(),
		sync: router(createSyncProcedures()),
		tools: router(createToolsProcedures()),
		presets: router(createPresetsProcedures()),
		marketplace: router(createMarketplaceProcedures()),
		gitBackup: router(createGitBackupProcedures()),
	});
};

export type SkillsRouter = ReturnType<typeof createSkillsRouter>;
