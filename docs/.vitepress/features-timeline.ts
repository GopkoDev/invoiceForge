import fs from 'node:fs';

// docs/changelog.md is the one place that says which feature is shipped, in progress or to do.
// The sidebar reads it so the two never disagree: features run newest first, in the changelog's
// own order (planned work, then work in progress, then shipped work from the latest). A feature
// named in several sections (a shipped feature with a planned follow-up) takes the most advanced one.

export type FeatureStatus = 'shipped' | 'in progress' | 'to do';

const SECTIONS: Record<string, FeatureStatus> = {
  shipped: 'shipped',
  'in progress': 'in progress',
  'to do': 'to do',
};

export function featureTimeline(changelogPath: string) {
  const bySection: Record<FeatureStatus, string[]> = {
    shipped: [],
    'in progress': [],
    'to do': [],
  };
  let section: FeatureStatus | undefined;

  for (const line of fs.readFileSync(changelogPath, 'utf8').split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = SECTIONS[heading[1].trim().toLowerCase()];
      continue;
    }
    if (!section) continue;
    for (const [, slug] of line.matchAll(/\]\(\.\/features\/([^/)]+)\//g)) {
      if (!bySection[section].includes(slug)) bySection[section].push(slug);
    }
  }

  const shipped = bySection.shipped;
  const inProgress = bySection['in progress'].filter(
    (slug) => !shipped.includes(slug)
  );
  const toDo = bySection['to do'].filter(
    (slug) => !shipped.includes(slug) && !inProgress.includes(slug)
  );

  const order = [
    ...toDo.map((slug) => [slug, 'to do'] as const),
    ...inProgress.map((slug) => [slug, 'in progress'] as const),
    ...shipped.map((slug) => [slug, 'shipped'] as const),
  ];
  return new Map<string, { index: number; status: FeatureStatus }>(
    order.map(([slug, status], index) => [slug, { index, status }])
  );
}
