import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.js';
import { getGitTreeFiles } from './utils/get-git-tree-files.js';
import { getDiffFiles } from './utils/get-diff-files.js';
import { resolveOrigHead } from './utils/resolve-orig-head.js';
import { checkCaseDifferences } from './utils/check-case-differences.js';
import { applyCaseChanges } from './utils/apply-case-changes.js';

const { name, version, description } = packageJson;

cli({
	name,

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
		since: {
			type: String,
			description: 'Only check files changed since this ref (e.g. ORIG_HEAD)',
		},
		merge: {
			type: Boolean,
			default: false,
			description: 'Only check files changed in the last merge/rebase (uses ORIG_HEAD)',
		},
	},

	help: {
		description,
	},
}, async (argv) => {
	const { dry, fixLocal, merge, since } = argv.flags;
	const { paths } = argv._;

	if (merge && since) {
		console.error('Error: --merge and --since are mutually exclusive');
		process.exit(1);
	}

	let sinceRef: string | null = null;
	if (merge) {
		sinceRef = await resolveOrigHead();
		if (!sinceRef) {
			process.exit(0);
		}
	} else if (since) {
		sinceRef = since;
	}

	const movedFiles = await getMovedFiles(paths);
	const gitFiles = sinceRef
		? await getDiffFiles(sinceRef, paths)
		: await getGitTreeFiles(paths);
	const caseDifferentFiles = await checkCaseDifferences(gitFiles);

	await applyCaseChanges({
		caseDifferentFiles,
		movedFiles,
		dry,
		fixLocal,
	});
});
