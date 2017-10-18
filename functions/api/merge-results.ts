import { uniq } from "lodash";
import * as semver from "semver";

import { ILambdaResponse } from "./";

import findConflicts from "./dependencies/find-conflicts";
import findMatchingVersion from "./dependencies/utils/find-matching-version";

/**
 * Compare two sorted string arrays
 *
 * @param {string[]} s1
 * @param {string[]} s2
 * @returns
 */
function isEqual(s1: string[], s2: string[]) {
  if (s1.length !== s2.length) {
    return false;
  }

  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Replaces the start of a key with a new string
 *
 * @param {{ [key: string]: string }} paths
 * @param {string} oldName
 * @param {string} newName
 */
function replacePaths(
  paths: { [key: string]: any },
  oldName: string,
  newName: string,
) {
  Object.keys(paths).forEach(al => {
    if (al.startsWith(`${oldName}/`)) {
      paths[al.replace(`${oldName}/`, `${newName}/`)] = paths[al];

      delete paths[al];
    }
  });
}

export default function mergeResults(responses: ILambdaResponse[]) {
  const dependencyConflictInfo = findConflicts(responses);

  const conflictingDependencies = Object.keys(dependencyConflictInfo).filter(
    n => Object.keys(dependencyConflictInfo[n]).length > 1,
  );

  const response: {
    aliases: { [path: string]: string | false };
    contents: { [path: string]: string };
    dependencies: Array<{ name: string; version: string }>;
    dependencyAliases: { [dep: string]: { [dep: string]: string } };
    dependencyDependencies: {
      [dep: string]: {
        semver: string;
        resolved: string;
        parents: string[];
        entries: string[];
      };
    };
  } = {
    aliases: {},
    contents: {},
    dependencies: [],
    dependencyAliases: {},
    dependencyDependencies: {},
  };

  for (const r of responses) {
    Object.keys(r.dependencyDependencies).forEach(depDepName => {
      if (response.dependencyDependencies[depDepName]) {
        const exDepDep = response.dependencyDependencies[depDepName];
        const newDepDep = r.dependencyDependencies[depDepName];

        if (exDepDep.resolved === newDepDep.resolved) {
          exDepDep.parents = uniq([...exDepDep.parents, ...newDepDep.parents]);
          exDepDep.entries = uniq([...exDepDep.entries, ...newDepDep.entries]);
        } else {
          if (
            semver.intersects(exDepDep.semver, newDepDep.semver) &&
            isEqual(exDepDep.entries, newDepDep.entries)
          ) {
            const replacingDepDep = semver.gt(
              newDepDep.resolved,
              exDepDep.resolved,
            )
              ? newDepDep
              : exDepDep;

            response.dependencyDependencies[depDepName] = replacingDepDep;
            response.dependencyDependencies[depDepName].parents = uniq([
              ...exDepDep.parents,
              ...newDepDep.parents,
            ]);
          } else {
            const newPath = `${depDepName}/${newDepDep.resolved}`;

            replacePaths(r.aliases, depDepName, newPath);
            replacePaths(r.contents, depDepName, newPath);
            r.dependencyDependencies[newPath] =
              r.dependencyDependencies[depDepName];
            delete r.dependencyDependencies[depDepName];

            newDepDep.parents.forEach(p => {
              response.dependencyAliases[p] =
                response.dependencyAliases[p] || {};
              response.dependencyAliases[p][depDepName] = newPath;
            });
          }
        }
      } else {
        response.dependencyDependencies[depDepName] =
          r.dependencyDependencies[depDepName];
      }
    });

    response.aliases = { ...response.aliases, ...r.aliases };
    response.contents = { ...response.contents, ...r.contents };
    response.dependencies = [...response.dependencies, r.dependency];
  }

  return response;
}
