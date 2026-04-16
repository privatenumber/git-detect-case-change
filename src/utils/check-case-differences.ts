import fs from 'node:fs/promises';
import path from 'node:path';

// Normalization matters on macOS/Windows where a file can be stored NFD on disk
// while git returns NFC from ls-tree — byte comparison would miss the match.
const normalize = (name: string) => name.normalize('NFC');
const canonicalize = (name: string) => normalize(name).toLowerCase();

// Three-tier lookup index per directory. Higher tiers take precedence so that
// when a directory contains multiple case- or normalization-equivalent siblings,
// the most-specific match wins instead of whichever entry the lower-tier map
// happened to hold last.
type DirectoryIndex = {
	exact: Set<string>; // bytewise identical
	normalized: Map<string, string>; // NFC-equal, case preserved
	canonical: Map<string, string>; // NFC + case-folded
};

export const checkCaseDifferences = async (gitFiles: string[], cwd = '.') => {
	const directoryCache = new Map<string, Promise<DirectoryIndex>>();

	const readDirectory = (directoryPath: string) => {
		let cached = directoryCache.get(directoryPath);
		if (!cached) {
			cached = fs.readdir(path.join(cwd, directoryPath)).then(
				(entries): DirectoryIndex => {
					const exact = new Set(entries);
					const normalized = new Map<string, string>();
					const canonical = new Map<string, string>();
					for (const entry of entries) {
						normalized.set(normalize(entry), entry);
						canonical.set(canonicalize(entry), entry);
					}
					return {
						exact,
						normalized,
						canonical,
					};
				},
				(error: Error): DirectoryIndex => {
					console.error(`Warning: Could not read directory ${directoryPath}: ${error.message}`);
					return {
						exact: new Set(),
						normalized: new Map(),
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
			const { exact, normalized, canonical } = await readDirectory(actualPath);
			const actualSegment = exact.has(segment)
				? segment
				: normalized.get(normalize(segment))
				?? canonical.get(canonicalize(segment));
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
		if (actualPath && normalize(actualPath) !== normalize(gitPath)) {
			result.push([gitPath, actualPath]);
		}
	}
	return result;
};
