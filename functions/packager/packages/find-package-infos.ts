import { flatten } from "lodash";
import { fs } from "mz";
import { basename, dirname, join } from "path";

import nodeResolvePath from "./utils/node-resolve-path";

export interface IPackage {
  name: string;
  main?: string;
  browser?: string | { [path: string]: string | false };
  unpkg?: string;
  module?: string;
  es2015?: string;
  version: string;
  dependencies?: {
    [depName: string]: string;
  };
  peerDependencies?: {
    [depName: string]: string;
  };
  [key: string]: any;
}

function getDirectories(path: string): string[] {
  const directories = fs
    .readdirSync(path)
    .filter(file => !file.startsWith("."))
    .filter(file => fs.lstatSync(join(path, file)).isDirectory())
    .map(file => join(path, file));

  return flatten(
    directories.map(directory => {
      if (basename(directory).startsWith("@")) {
        // We will check what inside this directory if it starts with an @, because
        // this means that it's under an organization

        return getDirectories(directory);
      }

      const directoriesInDirectory = getDirectories(directory);
      // There is a chance of a recursive node_modules, make sure to add it as well
      const nodeModulesInside = directoriesInDirectory.find(
        d => basename(d) === "node_modules",
      );

      if (nodeModulesInside) {
        return [directory, ...getDirectories(nodeModulesInside)];
      }

      return directory;
    }),
  );
}

// Fields to check, in this order
const MAIN_FIELDS = ["browser", "main", "unpkg", "module"];

/**
 * Finds the most appropriate main field to use from the package.json
 */
function getMainField(pkg: IPackage) {
  return MAIN_FIELDS.map(field => {
    const packageField = pkg[field];
    // It can also be an object, don't allow it in that case
    if (typeof packageField === "string") {
      return packageField;
    }

    return null;
  }).find(x => x != null);
}

/**
 * Rewrite the paths of the browser aliases to the relative path to the package
 *
 * @param {{ [path: string]: string }} browser
 * @param {string} packagePath
 */
function transformBrowserRequires(
  browser: { [path: string]: string } | string | undefined,
  packagePath: string,
): { [path: string]: string } {
  if (typeof browser !== "object") {
    return {};
  }

  return Object.keys(browser).reduce((total, next) => {
    // It can either be a string or false, if it's false we have to exclude
    // it from the total bundle.

    const path = browser[next] ? join(packagePath, browser[next]) : false;

    return {
      ...total,
      [join(packagePath, next)]: path,
    };
  }, {});
}

export default async function findPackageInfos(
  packageName: string,
  rootPath: string,
): Promise<{ [depName: string]: IPackage }> {
  const directories = getDirectories(join(rootPath, "node_modules"));

  const result: { [depName: string]: IPackage } = {};

  await Promise.all(
    directories.map(async path => {
      const pkgPath = join(path, "package.json");
      if (fs.existsSync(pkgPath)) {
        const contents = (await fs.readFile(pkgPath)).toString();
        result[pkgPath] = JSON.parse(contents);
      }
    }),
  );

  return result;
}
