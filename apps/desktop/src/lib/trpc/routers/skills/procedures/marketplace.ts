import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure } from "../../..";

interface SkillsShSkill {
	id: string;
	skillId: string;
	name: string;
	source: string;
	installs: number;
}

function parseSkillObject(obj: Record<string, unknown>): SkillsShSkill | null {
	const source = typeof obj.source === "string" ? obj.source : "";
	if (!source) return null;

	const skillId =
		typeof obj.skillId === "string"
			? obj.skillId
			: typeof obj.skill_id === "string"
				? obj.skill_id
				: typeof obj.id === "string"
					? obj.id
					: "";
	if (!skillId) return null;

	const name = typeof obj.name === "string" && obj.name ? obj.name : skillId;
	const installs = typeof obj.installs === "number" ? obj.installs : 0;

	return {
		id: `${source}/${skillId}`,
		skillId,
		name,
		source,
		installs,
	};
}

function parseSkillsArray(arr: unknown[]): SkillsShSkill[] {
	const results: SkillsShSkill[] = [];
	for (const item of arr) {
		if (item && typeof item === "object" && !Array.isArray(item)) {
			const skill = parseSkillObject(item as Record<string, unknown>);
			if (skill) results.push(skill);
		}
	}
	return results;
}

function parseLeaderboardHtml(html: string): SkillsShSkill[] {
	const nextDataMatch = html.match(
		/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
	);
	if (nextDataMatch) {
		try {
			const data = JSON.parse(nextDataMatch[1]);
			const props = data?.props?.pageProps;
			if (props) {
				for (const key of ["initialSkills", "skills", "items"]) {
					if (Array.isArray(props[key]) && props[key].length > 0) {
						return parseSkillsArray(props[key]);
					}
				}
			}
		} catch {}
	}

	const skills: SkillsShSkill[] = [];

	const patterns = [
		/\{[^{}]*"source"\s*:\s*"[^"]+"\s*,\s*"(?:skillId|skill_id)"\s*:\s*"[^"]+[^{}]*\}/g,
		/\{[^{}]*\\"source\\"\s*:\s*\\"[^"\\]+\\"\s*,\s*\\"(?:skillId|skill_id)\\"\s*:\s*\\"[^"\\]+[^{}]*\}/g,
	];

	for (const pattern of patterns) {
		for (const match of html.matchAll(pattern)) {
			try {
				const raw = match[0].replace(/\\"/g, '"');
				const obj = JSON.parse(raw);
				const skill = parseSkillObject(obj);
				if (skill) {
					const exists = skills.some((s) => s.id === skill.id);
					if (!exists) skills.push(skill);
				}
			} catch {}
		}
		if (skills.length > 0) break;
	}

	return skills;
}

const leaderboardCache = new Map<
	string,
	{ data: SkillsShSkill[]; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

const LEADERBOARD_URLS: Record<string, string> = {
	hot: "https://skills.sh/hot",
	trending: "https://skills.sh/trending",
	all_time: "https://skills.sh/",
};

export function createMarketplaceProcedures() {
	return {
		fetchLeaderboard: publicProcedure
			.input(
				z
					.object({
						sort: z.string().optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				const sort = input?.sort ?? "hot";
				const cacheKey = `leaderboard_${sort}`;

				const cached = leaderboardCache.get(cacheKey);
				if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
					return cached.data;
				}

				const url = LEADERBOARD_URLS[sort] ?? LEADERBOARD_URLS.hot;

				try {
					const response = await fetch(url, {
						headers: { "User-Agent": "skills-manager" },
						signal: AbortSignal.timeout(15000),
						redirect: "follow",
					});
					if (!response.ok) {
						throw new Error(`skills.sh returned ${response.status}`);
					}
					const html = await response.text();
					const skills = parseLeaderboardHtml(html);

					leaderboardCache.set(cacheKey, {
						data: skills,
						timestamp: Date.now(),
					});

					return skills;
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error
								? err.message
								: "Failed to fetch leaderboard",
					});
				}
			}),

		search: publicProcedure
			.input(z.object({ query: z.string() }))
			.query(async ({ input }) => {
				const limit = 60;
				const params = new URLSearchParams({
					q: input.query,
					limit: String(limit),
				});
				const url = `https://skills.sh/api/search?${params}`;

				try {
					const response = await fetch(url, {
						headers: { "User-Agent": "skills-manager" },
						signal: AbortSignal.timeout(15000),
					});
					if (!response.ok) {
						throw new Error(`skills.sh returned ${response.status}`);
					}

					const contentType = response.headers.get("content-type") ?? "";

					if (contentType.includes("application/json")) {
						const data = await response.json();
						if (Array.isArray(data)) {
							return parseSkillsArray(data);
						}
						if (
							data &&
							typeof data === "object" &&
							Array.isArray(data.skills)
						) {
							return parseSkillsArray(data.skills);
						}
						return [];
					}

					const html = await response.text();
					return parseLeaderboardHtml(html);
				} catch (err) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							err instanceof Error
								? err.message
								: "Failed to search marketplace",
					});
				}
			}),
	};
}
