import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.js';
import { getGitTreeFiles } from './utils/get-git-tree-files.js';
import { checkCaseDifferences } from './utils/check-case-differences.js';
import { applyCaseChanges } from './utils/apply-case-changes.js';

const { version, description } = packageJson;

(async () => {
	console.error('DEBUG: Starting git-detect-case-change');

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

	console.error(`DEBUG: Flags - dry: ${dry}, fixLocal: ${fixLocal}, paths: ${paths || 'undefined'}`);

	const movedFiles = await getMovedFiles(paths);
	console.error(`DEBUG: Found ${movedFiles.size} already moved files`);

	const gitFiles = await getGitTreeFiles(paths);
	console.error(`DEBUG: Got ${gitFiles.length} files from git`);

	const caseDifferentFiles = await checkCaseDifferences(gitFiles);
	console.error(`DEBUG: Final case different files: ${caseDifferentFiles.length}`);

	await applyCaseChanges({
		caseDifferentFiles,
		movedFiles,
		dry,
		fixLocal,
	});

	console.error('DEBUG: Finished');
})();
