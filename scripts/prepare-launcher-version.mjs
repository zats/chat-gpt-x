#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const projectPath = path.join(repoRoot, "src/macOS/project.yaml");
const appcastPath = path.join(repoRoot, "appcast.xml");
const write = process.argv.slice(2).includes("--write");

const semanticVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(value, label) {
  const match = semanticVersionPattern.exec(value);
  if (!match) {
    throw new Error(`${label} must be a semantic version: ${value}`);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function readProjectValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*([^\\s#]+)`, "m"));
  if (!match) {
    throw new Error(`${key} is missing from ${projectPath}`);
  }
  return match[1];
}

function newestAppcastEntry(source) {
  const entries = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  for (const itemMatch of source.matchAll(itemPattern)) {
    const item = itemMatch[1];
    const version = item.match(
      /<sparkle:shortVersionString>([^<]+)<\/sparkle:shortVersionString>/,
    )?.[1];
    const build = item.match(
      /<sparkle:version>(\d+)<\/sparkle:version>/,
    )?.[1];
    if (version && build) {
      entries.push({ version, parsedVersion: parseVersion(version, "Appcast version"), build: Number(build) });
    }
  }
  if (entries.length === 0) {
    throw new Error(`No launcher release exists in ${appcastPath}`);
  }
  return entries.reduce((newest, entry) => {
    const versionOrder = compareVersions(entry.parsedVersion, newest.parsedVersion);
    if (versionOrder > 0 || (versionOrder === 0 && entry.build > newest.build)) {
      return entry;
    }
    return newest;
  });
}

const projectSource = fs.readFileSync(projectPath, "utf8");
const appcastSource = fs.readFileSync(appcastPath, "utf8");
const declaredVersion = readProjectValue(projectSource, "MARKETING_VERSION");
const declaredBuild = Number(readProjectValue(projectSource, "CURRENT_PROJECT_VERSION"));
const declared = parseVersion(declaredVersion, "MARKETING_VERSION");
const latest = newestAppcastEntry(appcastSource);

if (!Number.isSafeInteger(declaredBuild) || declaredBuild < 1) {
  throw new Error(`CURRENT_PROJECT_VERSION must be a positive integer: ${declaredBuild}`);
}

const declaredSeries = declared.slice(0, 2);
const latestSeries = latest.parsedVersion.slice(0, 2);
const seriesOrder = compareVersions([...declaredSeries, 0], [...latestSeries, 0]);
const versionOrder = compareVersions(declared, latest.parsedVersion);
const resumesPreparedVersion = versionOrder > 0 && declaredBuild > latest.build;
let nextVersion;
let nextBuild;

if (seriesOrder < 0) {
  throw new Error(
    `Declared version series ${declared[0]}.${declared[1]} is older than released series ${latest.parsedVersion[0]}.${latest.parsedVersion[1]}`,
  );
}

if (resumesPreparedVersion) {
  nextVersion = declaredVersion;
  nextBuild = declaredBuild;
} else if (seriesOrder > 0) {
  if (compareVersions(declared, latest.parsedVersion) <= 0) {
    throw new Error(`Declared version ${declaredVersion} must be newer than ${latest.version}`);
  }
  nextVersion = declaredVersion;
  nextBuild = Math.max(declaredBuild, latest.build) + 1;
} else {
  nextVersion = `${declared[0]}.${declared[1]}.${Math.max(declared[2], latest.parsedVersion[2]) + 1}`;
  nextBuild = Math.max(declaredBuild, latest.build) + 1;
}

if (write) {
  const nextProjectSource = projectSource
    .replace(
      /^(\s*MARKETING_VERSION:\s*)[^\s#]+/m,
      `$1${nextVersion}`,
    )
    .replace(
      /^(\s*CURRENT_PROJECT_VERSION:\s*)[^\s#]+/m,
      `$1${nextBuild}`,
    );
  fs.writeFileSync(projectPath, nextProjectSource);
}

process.stdout.write(
  `${JSON.stringify({
    previousVersion: latest.version,
    previousBuild: latest.build,
    version: nextVersion,
    build: nextBuild,
    manuallyChangedSeries: seriesOrder > 0,
    resumesPreparedVersion,
  })}\n`,
);
