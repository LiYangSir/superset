/**
 * Lazy-loaded embedding service using Hugging Face Transformers.js
 * Model: Xenova/all-MiniLM-L6-v2 (384-dimensional, ~25MB)
 * Pure TypeScript cosine similarity — no external vector DB needed.
 */

let pipelineInstance: ReturnType<typeof createPipelinePromise> | null = null;

function createPipelinePromise() {
	return import("@huggingface/transformers").then(async (mod) => {
		const extractor = await mod.pipeline(
			"feature-extraction",
			"Xenova/all-MiniLM-L6-v2",
			{ dtype: "fp32" },
		);
		return extractor;
	});
}

function getExtractor() {
	if (!pipelineInstance) {
		pipelineInstance = createPipelinePromise();
	}
	return pipelineInstance;
}

export async function computeEmbedding(text: string): Promise<number[] | null> {
	if (!text.trim()) return null;

	try {
		const extractor = await getExtractor();
		const output = await extractor(text.slice(0, 512), {
			pooling: "mean",
			normalize: true,
		});
		return Array.from(output.data as Float32Array);
	} catch (e) {
		console.error("[embedding] computeEmbedding failed:", e);
		return null;
	}
}

export async function computeEmbeddingBatch(
	texts: string[],
): Promise<(number[] | null)[]> {
	if (texts.length === 0) return [];

	try {
		const extractor = await getExtractor();
		const results: (number[] | null)[] = [];

		for (const text of texts) {
			if (!text.trim()) {
				results.push(null);
				continue;
			}
			const output = await extractor(text.slice(0, 512), {
				pooling: "mean",
				normalize: true,
			});
			results.push(Array.from(output.data as Float32Array));
		}

		return results;
	} catch (e) {
		console.error("[embedding] batch failed:", e);
		return texts.map(() => null);
	}
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

export function rerankBySimilarity<T extends { vecSummary: unknown }>(
	items: T[],
	queryVec: number[],
	weight = 0.3,
	structuralScoreFn?: (item: T, index: number) => number,
): T[] {
	const scored = items.map((item, idx) => {
		const vec = item.vecSummary as number[] | null;
		const semanticScore = vec ? cosineSimilarity(queryVec, vec) : 0;
		const structuralScore = structuralScoreFn
			? structuralScoreFn(item, idx)
			: 1 - idx / Math.max(items.length, 1);

		const combined = weight * semanticScore + (1 - weight) * structuralScore;
		return { item, combined };
	});

	scored.sort((a, b) => b.combined - a.combined);
	return scored.map((s) => s.item);
}

export function isEmbeddingReady(): boolean {
	return pipelineInstance !== null;
}

export async function warmupEmbedding(): Promise<boolean> {
	try {
		await computeEmbedding("warmup");
		return true;
	} catch {
		return false;
	}
}
