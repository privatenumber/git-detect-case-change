import fs from 'node:fs/promises';

/**
 * Safely renames a file or directory using a two-step approach for case-only changes
 * on case-insensitive filesystems. Includes transactional rollback on failure.
 *
 * @param from - Source path
 * @param to - Target path
 * @param type - Type of entity being renamed (for error messages)
 * @returns true if rename succeeded, false otherwise
 */
export const safeCaseRename = async (
	from: string,
	to: string,
	type: 'file' | 'directory' = 'file',
): Promise<boolean> => {
	const tempPath = `${from}.tmp-${process.pid}-${Date.now()}`;

	try {
		await fs.rename(from, tempPath);
		await fs.rename(tempPath, to);
		return true;
	} catch (error) {
		console.error(`Failed to rename ${type} ${from} -> ${to}: ${(error as Error).message}`);

		// ROLLBACK: Attempt to restore from the temp path
		try {
			await fs.access(tempPath);
			await fs.rename(tempPath, from);
			console.error(`Restored ${from} from temporary ${type}.`);
		} catch (rollbackError) {
			console.error(
				`CRITICAL: Failed to restore ${from} from ${tempPath}. ${type.charAt(0).toUpperCase() + type.slice(1)} may be lost!`,
				(rollbackError as Error).message,
			);
		}
		return false;
	}
};
