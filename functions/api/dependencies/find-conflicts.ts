import { uniq } from "lodash";
import * as s from "semver";
import { ILambdaResponse } from "../";

import findMatchingVersion from "./utils/find-matching-version";

interface IDependencyDependency {
  semver: string;
  parents: string[];
  parentRootDependencies: string[];
  entries: string[];
}

interface IResult {
  [depName: string]: {
    [resolvedVersion: string]: IDependencyDependency;
  };
}

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
 * Finds the version in the result that matches the dependency. First by checking
 * if there is an absolute version match, if there is none we check if there are
 * semver matching versions. We return this semver matching version if the entry points
 * between the dependencies are the same (so we get no conflicts internally).
 *
 * @param {IResult} result
 * @param {string} depName
 * @param {{
 *     semver: string;
 *     resolved: string;
 *     parents: string[];
 *     entries: string[];
 *   }} depDep
 * @returns
 */
function findResolvedVersion(
  result: IResult,
  depName: string,
  depDep: {
    semver: string;
    resolved: string;
    parents: string[];
    entries: string[];
  },
) {
  let resolvedVersion = result[depName][depDep.resolved];

  if (!resolvedVersion) {
    // We now know that there is no matching absolute version, now check if
    // there is a semver matching version
    const matchingVersion = findMatchingVersion(
      Object.keys(result[depName]),
      depDep.semver,
    );

    if (matchingVersion) {
      const matchingDep = result[depName][matchingVersion];

      if (isEqual(matchingDep.entries, depDep.entries)) {
        // We have the exact same entry points, so we might as well use the newest
        // version as resolvedVersion. There will be no internal conflicts this way
        resolvedVersion = { ...result[depName][matchingVersion] };

        if (s.gt(depDep.resolved, matchingVersion)) {
          result[depName][depDep.resolved] = resolvedVersion;
          delete result[depName][matchingVersion];
        }
      }
    }
  }

  return resolvedVersion;
}

/**
 * Create a new object with the different dependency versions splitted out. This
 * way we can resolve conflicts in dependencies of dependencies
 *
 * @return An object with every dependencies and an object with resolved versions and the parents
 */
export default function findConflicts(dependencies: ILambdaResponse[]) {
  const result: IResult = {};

  dependencies.forEach(dependency => {
    Object.keys(dependency.dependencyDependencies).forEach(depName => {
      const depDep = dependency.dependencyDependencies[depName];

      result[depName] = result[depName] || {};

      const resolvedVersion = findResolvedVersion(result, depName, depDep);

      // We found a version in the object that already matches absolute/semver
      if (resolvedVersion) {
        resolvedVersion.parents = uniq([
          ...resolvedVersion.parents,
          ...depDep.parents,
        ]);

        resolvedVersion.parentRootDependencies = uniq([
          ...resolvedVersion.parentRootDependencies,
          dependency.dependency.name,
        ]);

        resolvedVersion.entries = uniq([
          ...resolvedVersion.entries,
          ...depDep.entries,
        ]).sort();
      } else {
        result[depName][depDep.resolved] = {
          parents: depDep.parents,
          semver: depDep.semver,
          parentRootDependencies: [dependency.dependency.name],
          entries: depDep.entries,
        };
      }
    });
  });

  return result;
}
