import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function filterUnpublishedComponents(plan, publishedReleases) {
  const isPublished = (component) =>
    component !== null && publishedReleases.has(component.release);
  return {
    ...plan,
    chatgptApi: isPublished(plan.chatgptApi) ? null : plan.chatgptApi,
    bindings: plan.bindings.filter((binding) => !isPublished(binding)),
    extensions: plan.extensions.filter(
      (extension) => !isPublished(extension),
    ),
  };
}

function readPublishedReleases(repository) {
  const pages = JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/releases?per_page=100`,
      ],
      { encoding: "utf8" },
    ),
  );
  const published = new Set();
  for (const release of pages.flat()) {
    if (release.draft) continue;
    const assetNames = new Set(
      (release.assets ?? []).map((asset) => asset.name),
    );
    if (
      assetNames.has(`${release.tag_name}.zip`) &&
      assetNames.has(`${release.tag_name}.zip.sha256`)
    ) {
      published.add(release.tag_name);
    }
  }
  return published;
}

function run() {
  const [inputArgument, outputArgument] = process.argv.slice(2);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!inputArgument || !outputArgument || !repository) {
    throw new Error(
      "usage: GITHUB_REPOSITORY=<owner/repo> node scripts/filter-unpublished-component-releases.mjs <input-plan.json> <output-plan.json>",
    );
  }
  const input = path.resolve(inputArgument);
  const output = path.resolve(outputArgument);
  const plan = JSON.parse(readFileSync(input, "utf8"));
  const filtered = filterUnpublishedComponents(
    plan,
    readPublishedReleases(repository),
  );
  writeFileSync(output, `${JSON.stringify(filtered, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
