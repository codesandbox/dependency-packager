import { IPackageInfo } from "../packages/find-package-infos";

interface IPackageInfos {
  [depName: string]: IPackageInfo;
}

interface IDependencyDependenciesInfo {
  dependencyDependencies: {
    [depName: string]: {
      parents: string[];
      semver: string;
      resolved: string;
      entries: string[];
    };
  };
  peerDependencies: { [depName: string]: string };
}

function findDependencies(
  dep: string,
  packageInfos: IPackageInfos,
  requiresByDependencies: { [dep: string]: string[] },
  totalObject: IDependencyDependenciesInfo,
) {
  if (!packageInfos[dep]) {
    return;
  }

  const mainPackageInfo = packageInfos[dep].package;

  if (mainPackageInfo.peerDependencies) {
    totalObject.peerDependencies = {
      ...totalObject.peerDependencies,
      ...mainPackageInfo.peerDependencies,
    };
  }

  const dependencies = mainPackageInfo.dependencies;
  if (dependencies) {
    Object.keys(dependencies).forEach(name => {
      if (!packageInfos[name]) {
        return;
      }

      if (totalObject.dependencyDependencies[name]) {
        if (
          totalObject.dependencyDependencies[name].parents.indexOf(dep) === -1
        ) {
          totalObject.dependencyDependencies[name].parents.push(dep);
        }
        return;
      }

      totalObject.dependencyDependencies[name] = {
        semver: dependencies[name],
        resolved: packageInfos[name].package.version,
        parents: [dep],
        entries: (requiresByDependencies[name] || []).sort(),
      };
      findDependencies(name, packageInfos, requiresByDependencies, totalObject);
    });
  }

  return totalObject;
}

export default function findDependencyDependencies(
  dep: string,
  packageInfos: IPackageInfos,
  requires: Set<string>,
) {
  const totalObject = {
    peerDependencies: {},
    dependencyDependencies: {},
  };

  const requireObject: { [dep: string]: string[] } = {};

  // We create an object that maps every dependency to the require statements
  // they are involved in. This way we know exactly what we require of dependencies
  for (const requireDep of requires) {
    if (!/^[\w|@\w]/.test(requireDep)) {
      continue;
    }

    const dependencyParts = requireDep.split("/");

    const dependencyName = requireDep.startsWith("@")
      ? `${dependencyParts[0]}/${dependencyParts[1]}`
      : dependencyParts[0];

    requireObject[dependencyName] = requireObject[dependencyName] || [];

    requireObject[dependencyName].push(requireDep);
  }

  return findDependencies(dep, packageInfos, requireObject, totalObject);
}
