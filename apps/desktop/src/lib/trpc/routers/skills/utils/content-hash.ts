import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SKIP_NAMES = new Set([".git", ".DS_Store"]);

export async function hashDirectory(dir: string): Promise<string> {
	const files = await listContentFiles(dir);
	const hash = crypto.createHash("sha256");

	for (const relPath of files) {
		hash.update(relPath);
		const contents = await fs.readFile(path.join(dir, relPath));
		hash.update(contents);
	}

	return hash.digest("hex");
}

export async function listContentFiles(dir: string): Promise<string[]> {
	const results: string[] = [];
	await walkDir(dir, dir, results);
	results.sort();
	return results;
}

async function walkDir(
	base: string,
	current: string,
	results: string[],
): Promise<void> {
	const entries = await fs.readdir(current, { withFileTypes: true });

	for (const entry of entries) {
		if (SKIP_NAMES.has(entry.name)) continue;

		const fullPath = path.join(current, entry.name);

		if (entry.isDirectory()) {
			await walkDir(base, fullPath, results);
		} else if (entry.isFile()) {
			results.push(path.relative(base, fullPath));
		}
	}
}

export async function hashFile(filePath: string): Promise<string> {
	const contents = await fs.readFile(filePath);
	return crypto.createHash("sha256").update(contents).digest("hex");
}
