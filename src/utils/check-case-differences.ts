import exists from 'fs.promises.exists';

const BATCH_SIZE = 100;

export const checkCaseDifferences = async (gitFiles: string[]) => {
	console.error(`DEBUG: Checking ${gitFiles.length} files from git`);
	const result: [string, string | false][] = [];

	for (let i = 0; i < gitFiles.length; i += BATCH_SIZE) {
		const batch = gitFiles.slice(i, i + BATCH_SIZE);
		const batchResults = await Promise.all(
			batch.map(async (filePath) => {
				try {
					const actualPath = await exists(filePath, false);
					console.error(`DEBUG: Git path: ${filePath}, Actual path: ${actualPath || 'false'}`);
					return [
						filePath,
						actualPath,
					] as [string, string | false];
				} catch (error) {
					// Handle permission errors or other fs errors gracefully
					console.error(`Warning: Could not check ${filePath}: ${(error as Error).message}`);
					return [filePath, false] as [string, string | false];
				}
			}),
		);
		result.push(...batchResults);
	}

	const filtered = result.filter(
		([oldFilePath, newFilePath]) => (
			newFilePath && (oldFilePath !== newFilePath)
		),
	) as string[][];

	console.error(`DEBUG: Found ${filtered.length} case differences`);
	return filtered;
};
