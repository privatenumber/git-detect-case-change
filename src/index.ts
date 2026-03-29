import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.js';
import { getGitTreeFiles } from './utils/get-git-tree-files.js';
import { getDiffFiles } from './utils/get-diff-files.js';
import { resolveRef } from './utils/resolve-ref.js';
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
	},

	help: {
		description,
	},
}, async (argv) => {
	const { dry, fixLocal, since } = argv.flags;
	const { paths } = argv._;

	let sinceRef: string | null = null;
	if (since) {
		sinceRef = await resolveRef(since);
		if (!sinceRef) {
			console.error(`Error: '${since}' is not a valid ref`);
			process.exit(1);
		}
	}

	const movedFiles = fixLocal ? new Map<string, string>() : await getMovedFiles(paths);
	const gitFiles = sinceRef
		? await getDiffFiles(sinceRef, paths)
		: await getGitTreeFiles(paths);
	const caseDifferentFiles = await checkCaseDifferences(gitFiles);

	const changesFound = await applyCaseChanges({
		caseDifferentFiles,
		movedFiles,
		dry,
		fixLocal,
	});

	if (dry && changesFound > 0) {
		process.exit(1);
	}
});
