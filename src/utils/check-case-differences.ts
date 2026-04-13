import fs from 'node:fs/promises';
import path from 'node:path';

const BATCH_SIZE = 100;

/**
 * Resolve filesystem-accurate directory paths by walking the tree segment-by-segment.
 *
 * Git-cased paths can't be passed directly to readdir on case-sensitive filesystems,
 * so we resolve each segment against its parent's actual entries first.
 *
 * Returns a map: lowercased dir path -> filesystem-accurate dir path
 */
const resolveDirectoryPaths = async (gitFiles: string[], cwd: string) => {
	// Collect unique directory segments needed at each depth
	// Key: lowercased dir path, Value: git-cased dir path
	const uniqueDirectories = new Map<string, string>([['.', '.']]);

	for (const filePath of gitFiles) {
		const parts = filePath.split('/');
		for (let i = 1; i < parts.length; i += 1) {
			const dir = parts.slice(0, i).join('/');
			const key = dir.toLowerCase();
			if (!uniqueDirectories.has(key)) {
				uniqueDirectories.set(key, dir);
			}
		}
	}

	// Group directories by depth so we can resolve parents before children
	const byDepth = new Map<number, string[]>();
	for (const [key, gitDir] of uniqueDirectories) {
		if (key === '.') {
			continue;
		}
		const depth = gitDir.split('/').length;
		let list = byDepth.get(depth);
		if (!list) {
			list = [];
			byDepth.set(depth, list);
		}
		list.push(key);
	}

	// Map: lowercased dir path -> filesystem-accurate path
	const resolvedDirectories = new Map<string, string>([['.', '.']]);

	const depthEntries = Array.from(byDepth.entries()).sort(([a], [b]) => a - b);

	for (const [, directories] of depthEntries) {
		for (let i = 0; i < directories.length; i += BATCH_SIZE) {
			const batch = directories.slice(i, i + BATCH_SIZE);
			await Promise.all(
				batch.map(async (lowerKey) => {
					const gitDir = uniqueDirectories.get(lowerKey);
					if (!gitDir) {
						return;
					}
					const parts = gitDir.split('/');
					const segmentName = parts.at(-1);
					if (!segmentName) {
						return;
					}
					const parentKey = parts.slice(0, -1).join('/').toLowerCase() || '.';
					const parentPath = resolvedDirectories.get(parentKey);

					if (!parentPath) {
						// Parent couldn't be resolved, skip
						return;
					}

					// Resolve this segment by reading the parent directory
					const resolvedPath = await resolveSegment(
						cwd,
						parentPath,
						segmentName,
					);
					if (resolvedPath) {
						resolvedDirectories.set(lowerKey, resolvedPath);
					}
				}),
			);
		}
	}

	return resolvedDirectories;
};

/**
 * Resolve a single path segment against its parent directory on the filesystem.
 * Returns the filesystem-accurate relative path, or undefined if not found.
 */
const resolveSegment = async (
	cwd: string,
	parentPath: string,
	segmentName: string,
): Promise<string | undefined> => {
	const absParent = parentPath === '.' ? cwd : path.join(cwd, parentPath);
	try {
		const entries = await fs.readdir(absParent);
		const lowerSegment = segmentName.toLowerCase();
		const actual = entries.find(entry => entry.toLowerCase() === lowerSegment);
		if (actual) {
			return parentPath === '.' ? actual : `${parentPath}/${actual}`;
		}
	} catch (error) {
		console.error(`Warning: Could not read directory ${parentPath}: ${(error as Error).message}`);
	}
	return undefined;
};

export const checkCaseDifferences = async (gitFiles: string[], cwd = '.') => {
	// Build a cache of directory entries keyed by resolved filesystem paths
	const resolvedDirectories = await resolveDirectoryPaths(gitFiles, cwd);

	// Read all resolved directories in batches to build a case-insensitive entry cache
	// Key: lowercased dir path -> Map<lowercased entry name, actual entry name>
	const dirCache = new Map<string, Map<string, string>>();
	const dirEntries = [...resolvedDirectories.entries()];

	for (let i = 0; i < dirEntries.length; i += BATCH_SIZE) {
		const batch = dirEntries.slice(i, i + BATCH_SIZE);
		await Promise.all(
			batch.map(async ([lowerKey, fsPath]) => {
				const absFsPath = fsPath === '.' ? cwd : path.join(cwd, fsPath);
				try {
					const entries = await fs.readdir(absFsPath);
					const entryMap = new Map<string, string>();
					for (const entry of entries) {
						entryMap.set(entry.toLowerCase(), entry);
					}
					dirCache.set(lowerKey, entryMap);
				} catch (error) {
					console.error(`Warning: Could not read directory ${fsPath}: ${(error as Error).message}`);
				}
			}),
		);
	}

	// Resolve actual filesystem paths using the cache (no I/O)
	const result: string[][] = [];

	for (const filePath of gitFiles) {
		const parts = filePath.split('/');
		const resolvedParts: string[] = [];
		let resolved = true;

		for (const part of parts) {
			const currentDir = resolvedParts.length === 0
				? '.'
				: resolvedParts.join('/').toLowerCase();
			const entries = dirCache.get(currentDir);
			if (!entries) {
				resolved = false;
				break;
			}

			const actual = entries.get(part.toLowerCase());
			if (!actual) {
				resolved = false;
				break;
			}

			resolvedParts.push(actual);
		}

		if (resolved) {
			const actualPath = resolvedParts.join('/');
			if (actualPath !== filePath) {
				result.push([filePath, actualPath]);
			}
		}
	}

	return result;
};
