// Where a dismiss-by-type applies: every finding of the requirement in the
// project (its dimension), in one principle, or in one file.
export const DISMISS_SCOPE = Object.freeze({ PROJECT: 'project', PRINCIPLE: 'principle', FILE: 'file' });

// The findings workbench: which findings show, and how the list is grouped.
export const FINDING_STATUS = Object.freeze({ OPEN: 'open', DISMISSED: 'dismissed', ALL: 'all' });
export const FINDING_GROUP = Object.freeze({
  NONE: 'none', FOLDERS: 'folders', REQUIREMENT: 'requirement', FILE: 'file', DIMENSION: 'dimension',
});
