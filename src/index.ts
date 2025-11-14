import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.js';
import { getGitTreeFiles } from './utils/get-git-tree-files.js';
import { checkCaseDifferences } from './utils/check-case-differences.js';
import { applyCaseChanges } from './utils/apply-case-changes.js';

const { version, description } = packageJson;

(async () => {
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

	const movedFiles = await getMovedFiles(paths);
	const gitFiles = await getGitTreeFiles(paths);
	const caseDifferentFiles = await checkCaseDifferences(gitFiles);

	await applyCaseChanges({
		caseDifferentFiles,
		movedFiles,
		dry,
		fixLocal,
	});
})();
