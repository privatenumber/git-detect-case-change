import fs from 'node:fs/promises';
import path from 'node:path';

// NFC-normalized lowercase. Normalization matters on macOS/Windows where a file
// can be stored NFD on disk while git returns NFC from ls-tree — byte comparison
// would miss the match and silently skip the file.
const canonicalize = (name: string) => name.normalize('NFC').toLowerCase();

export const checkCaseDifferences = async (gitFiles: string[], cwd = '.') => {
	const directoryCache = new Map<string, Promise<Map<string, string>>>();

	const readDirectory = (directoryPath: string) => {
		let cached = directoryCache.get(directoryPath);
		if (!cached) {
			cached = fs.readdir(path.join(cwd, directoryPath)).then(
				(entries) => {
					const entryMap = new Map<string, string>();
					for (const entry of entries) {
						entryMap.set(canonicalize(entry), entry);
					}
					return entryMap;
				},
				(error: Error) => {
					console.error(`Warning: Could not read directory ${directoryPath}: ${error.message}`);
					return new Map<string, string>();
				},
			);
			directoryCache.set(directoryPath, cached);
		}
		return cached;
	};

	const resolveActualPath = async (gitPath: string) => {
		let actualPath = '.';
		for (const segment of gitPath.split('/')) {
			const entries = await readDirectory(actualPath);
			const actualSegment = entries.get(canonicalize(segment));
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
