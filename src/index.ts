import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };
import { getMovedFiles } from './utils/get-moved-files.ts';
import { getGitTreeFiles } from './utils/get-git-tree-files.ts';
import { getDiffFiles } from './utils/get-diff-files.ts';
import { resolveRef } from './utils/resolve-ref.ts';
import { checkCaseDifferences } from './utils/check-case-differences.ts';
import { applyCaseChanges } from './utils/apply-case-changes.ts';

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
		check: {
			type: Boolean,
			default: false,
			description: 'Exit with code 1 if case mismatches are found (implies --dry)',
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
	const { fixLocal, since, check } = argv.flags;
	const dry = argv.flags.dry || check;
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

	if (check && changesFound > 0) {
		process.exit(1);
	}
});
