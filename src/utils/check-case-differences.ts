import fs from 'node:fs/promises';
import path from 'node:path';

// NFC-normalized lowercase. Normalization matters on macOS/Windows where a file
// can be stored NFD on disk while git returns NFC from ls-tree — byte comparison
// would miss the match and silently skip the file.
const canonicalize = (name: string) => name.normalize('NFC').toLowerCase();

type DirectoryIndex = {
	exact: Set<string>;
	canonical: Map<string, string>;
};

export const checkCaseDifferences = async (gitFiles: string[], cwd = '.') => {
	const directoryCache = new Map<string, Promise<DirectoryIndex>>();

	const readDirectory = (directoryPath: string) => {
		let cached = directoryCache.get(directoryPath);
		if (!cached) {
			cached = fs.readdir(path.join(cwd, directoryPath)).then(
				(entries): DirectoryIndex => {
					const exact = new Set(entries);
					const canonical = new Map<string, string>();
					for (const entry of entries) {
						canonical.set(canonicalize(entry), entry);
					}
					return {
						exact,
						canonical,
					};
				},
				(error: Error): DirectoryIndex => {
					console.error(`Warning: Could not read directory ${directoryPath}: ${error.message}`);
					return {
						exact: new Set(),
						canonical: new Map(),
					};
				},
			);
			directoryCache.set(directoryPath, cached);
		}
		return cached;
	};

	const resolveActualPath = async (gitPath: string) => {
		let actualPath = '.';
		for (const segment of gitPath.split('/')) {
			const { exact, canonical } = await readDirectory(actualPath);
			// Exact match wins over canonical lookup. On case-sensitive filesystems
			// a directory may contain both 'index.ts' and 'INDEX.ts' as distinct
			// files; if git asks for one of them, return that exact entry rather
			// than whichever case-collision sibling the canonical map happens to hold.
			const actualSegment = exact.has(segment) ? segment : canonical.get(canonicalize(segment));
			if (!actualSegment) {
				return undefined;
			}
			actualPath = actualPath === '.' ? actualSegment : `${actualPath}/${actualSegment}`;
		}
		return actualPath;
	};

	const resolved = await Promise.all(
		gitFiles.map(async gitPath => [gitPath, await resolveActualPath(gitPath)] as const),
	);

	const result: string[][] = [];
	for (const [gitPath, actualPath] of resolved) {
		// Case-preserving normalization compare: a pure NFC/NFD difference isn't
		// a case change and shouldn't be reported.
		if (actualPath && actualPath.normalize('NFC') !== gitPath.normalize('NFC')) {
			result.push([gitPath, actualPath]);
		}
	}
	return result;
};
