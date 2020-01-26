import { uniq } from "lodash";
import * as semver from "semver";

import { ILambdaResponse } from "./";

import findMatchingVersion from "./dependencies/utils/find-matching-version";

interface IDepDepInfo {
  semver: string;
  resolved: string;
  parents: string[];
  entries: string[];
}

interface IContents {
  [path: string]: { content: string };
}

interface IResponse {
  contents: IContents;
  dependencies: Array<{ name: string; version: string }>;
  dependencyAliases: { [dep: string]: { [dep: string]: string } };
  dependencyDependencies: {
    [dep: string]: IDepDepInfo;
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
    if (al.startsWith(`${oldName}/`) || al === oldName) {
      paths[al.replace(oldName, newName)] =
        typeof paths[al] === "string"
          ? paths[al].replace(oldName, newName)
          : paths[al];

      delete paths[al];
    }
  });
}

function replaceContents(
  response: IResponse,
  newResponse: ILambdaResponse,
  dependencyName: string,
  handled: string[] = [],
) {
  const contents = response.contents;
  const newContents = newResponse.contents;

  // This means that the existing content already has the latest version of this dependency,
  // at the end of the loop we overwrite existing content with the new content. So we now overwrite
  // the new content with the files of the newer version in the old response.
  const replacedContents: IContents = {};
  Object.keys(contents).forEach(p => {
    if (p.startsWith(`/node_modules/${dependencyName}`)) {
      replacedContents[p] = contents[p];
    }
  });

  Object.keys(newContents).forEach(p => {
    if (!p.startsWith(`/node_modules/${dependencyName}`) || !contents[p]) {
      replacedContents[p] = newContents[p];
    }
  });

  newResponse.contents = replacedContents;

  // Now do the same for all transient dependencies, mutate the existing contents
  const transientDependencies = Object.keys(
    response.dependencyDependencies,
  ).filter(
    dep =>
      handled.indexOf(dep) === -1 &&
      response.dependencyDependencies[dep].parents.indexOf(dependencyName) > -1,
  );

  const nowHandled = [...handled, dependencyName];

  transientDependencies.forEach(dep => {
    replaceContents(response, newResponse, dep, nowHandled);
    nowHandled.push(dep);
  });

  return newResponse;
}

function replaceDependencyInfo(
  r: ILambdaResponse,
  depDepName: string,
  newDepDep: IDepDepInfo,
) {
  const newPath = `${depDepName}/${newDepDep.resolved}`;
  console.log(
    "Resolving conflict for " + depDepName + " replaced path: " + newPath,
  );

  replacePaths(
    r.contents,
    `/node_modules/${depDepName}`,
    `/node_modules/${newPath}`,
  );

  r.dependencyDependencies[newPath] = r.dependencyDependencies[depDepName];
  delete r.dependencyDependencies[depDepName];

  for (const n of Object.keys(r.dependencyDependencies)) {
    r.dependencyDependencies[n].parents = r.dependencyDependencies[
      n
    ].parents.map(p => (p === depDepName ? newPath : p));
  }

  r.dependencyAliases = r.dependencyAliases || {};
  newDepDep.parents.forEach(p => {
    r.dependencyAliases[p] = r.dependencyAliases[p] || {};
    r.dependencyAliases[p][depDepName] = newPath;
  });
  replacePaths(r.dependencyAliases, depDepName, newPath);
}

const intersects = (v1: string, v2: string) => {
  try {
    return semver.intersects(v1, v2);
  } catch (e) {
    return false;
  }
};

const gt = (v1: string, v2: string) => {
  try {
    return semver.gt(v1, v2);
  } catch (e) {
    return false;
  }
};

export default function mergeResults(responses: ILambdaResponse[]) {
  // For consistency between requests
  const sortedResponses = responses.sort((a, b) =>
    a.dependency.name.localeCompare(b.dependency.name),
  );

  const response: IResponse = {
    contents: {},
    dependencies: sortedResponses.map(r => r.dependency),
    dependencyAliases: {},
    dependencyDependencies: {},
  };

  for (const r of sortedResponses) {
    for (let i = 0; i < Object.keys(r.dependencyDependencies).length; i++) {
      const depDepName = Object.keys(r.dependencyDependencies)[i];

      const newDepDep = r.dependencyDependencies[depDepName];
      const rootDependency = response.dependencies.find(
        d => d.name === depDepName,
      );

      if (
        rootDependency &&
        !intersects(rootDependency.version, newDepDep.semver) &&
        rootDependency.version !== newDepDep.resolved && // Sometimes the intersection returns a bad response (eg. for ^beta-4.4.4, so we also just check if resolved is same)
        rootDependency.name !== r.dependency.name // and this dependency doesn't require an older version of itself
      ) {
        console.log(
          rootDependency.name,
          "choosing",
          rootDependency.version,
          "over",
          newDepDep.resolved,
        );
        // If a root dependency is in conflict with a child dependency, we always
        // go for the root dependency
        replaceDependencyInfo(r, depDepName, newDepDep);

        // Start from the beginning, to make sure everything is correct
        i = -1;
      } else if (response.dependencyDependencies[depDepName]) {
        const exDepDep = response.dependencyDependencies[depDepName];

        if (exDepDep.resolved === newDepDep.resolved) {
          exDepDep.parents = uniq([...exDepDep.parents, ...newDepDep.parents]);
          exDepDep.entries = uniq([...exDepDep.entries, ...newDepDep.entries]);
        } else {
          if (
            intersects(exDepDep.semver, newDepDep.semver) &&
            isEqual(exDepDep.entries, newDepDep.entries)
          ) {
            const replacingDepDep = gt(newDepDep.resolved, exDepDep.resolved)
              ? newDepDep
              : exDepDep;

            response.dependencyDependencies[depDepName] = replacingDepDep;
            response.dependencyDependencies[depDepName].parents = uniq([
              ...exDepDep.parents,
              ...newDepDep.parents,
            ]);

            if (replacingDepDep === exDepDep) {
              // This means that the existing content already has the latest version of this dependency,
              // at the end of the loop we overwrite existing content with the new content. So we now overwrite
              // the new content with the files of the newer version in the old response.

              r.contents = replaceContents(response, r, depDepName).contents;
            }
          } else {
            replaceDependencyInfo(r, depDepName, newDepDep);
            // Start from the beginning, to make sure everything is correct
            i = -1;
          }
        }
      } else if (
        rootDependency &&
        intersects(rootDependency.version, newDepDep.semver) &&
        gt(rootDependency.version, newDepDep.resolved)
      ) {
        // There's a root dependency and it has a higher version than the transient dependency (but is still compatible),
        // so we replace all contents of this with the contents of the root dep.
        replaceContents(response, r, depDepName);
      } else {
        response.dependencyDependencies[depDepName] =
          r.dependencyDependencies[depDepName];
      }
    }

    response.dependencyAliases = {
      ...response.dependencyAliases,
      ...r.dependencyAliases,
    };
    response.contents = { ...response.contents, ...r.contents };
  }

  return response;
}
