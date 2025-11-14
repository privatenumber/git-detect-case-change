console.log('DEBUG: Script loaded');

import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.js';
import { getGitTreeFiles } from './utils/get-git-tree-files.js';
import { checkCaseDifferences } from './utils/check-case-differences.js';
import { applyCaseChanges } from './utils/apply-case-changes.js';

const { version, description } = packageJson;

console.log('DEBUG: About to run main function');

(async () => {
	try {
		console.log('DEBUG: Starting git-detect-case-change');

		const argv = cli({
			name: 'git-detect-case-change',

			version,

			parameters: ['--', '[paths...]'],

			flags: {
				dry: {
					type: Boolean,
					default: false,
					alias: 'd',
					description: 'Dry run mode',
				},
				fixLocal: {
					type: Boolean,
					default: false,
					description: 'Rename local files to match Git case (instead of staging local changes)',
				},
			},

			help: {
				description,
			},
		});

		const { dry, fixLocal } = argv.flags;
		const { paths } = argv._;

		console.log(`DEBUG: Flags - dry: ${dry}, fixLocal: ${fixLocal}, paths: ${paths || 'undefined'}`);

		const movedFiles = await getMovedFiles(paths);
		console.log(`DEBUG: Found ${movedFiles.size} already moved files`);

		const gitFiles = await getGitTreeFiles(paths);
		console.log(`DEBUG: Got ${gitFiles.length} files from git`);

		const caseDifferentFiles = await checkCaseDifferences(gitFiles);
		console.log(`DEBUG: Final case different files: ${caseDifferentFiles.length}`);

		await applyCaseChanges({
			caseDifferentFiles,
			movedFiles,
			dry,
			fixLocal,
		});

		console.log('DEBUG: Finished');
	} catch (error) {
		console.log('DEBUG: ERROR CAUGHT:', error);
		throw error;
	}
})().catch((error) => {
	console.log('DEBUG: UNCAUGHT ERROR:', error);
	process.exit(1);
});
