import { fs } from "mz";
import { dirname, join } from "path";

interface IPackage {
  name: string;
  main?: string;
  browser?: string | { [path: string]: string };
  unpkg?: string;
  module?: string;
  [key: string]: any;
}

export interface IPackageInfo {
  package: IPackage;
  main: string | undefined;
  aliases: { [key: string]: string };
}

function getDirectories(path: string) {
  const directories = fs.readdirSync(path);

  return directories
    .filter(file => !file.startsWith("."))
    .filter(file => fs.lstatSync(join(path, file)).isDirectory());
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

export default async function findAliases(
  packageName: string,
  rootPath: string,
): Promise<{ [depName: string]: IPackageInfo }> {
  const directories = getDirectories(
    join(rootPath, "node_modules"),
  ).reduce((total, next) => {
    if (next.startsWith("@")) {
      // We will check what inside this directory if it starts with an @, because
      // this means that it's under an organization

      return [
        ...total,
        ...getDirectories(join(rootPath, "node_modules", next)).map(dir =>
          join(next, dir),
        ),
      ];
    }

    return [...total, next];
  }, []);

  const packageJSONs = await Promise.all(
    directories.map(async name => {
      const contents = await fs.readFile(
        join(rootPath, "node_modules", name, "package.json"),
      );

      const pkg: IPackage = JSON.parse(contents.toString());

      return { name, package: pkg };
    }),
  );

  return packageJSONs.reduce((total, next) => {
    const mainPath = getMainField(next.package) || "index.js";
    const packagePath = join(rootPath, "node_modules", next.name);

    const absolutePath = join(packagePath, mainPath);
    const path = fs.existsSync(absolutePath) ? absolutePath : null;

    const browserAliases = transformBrowserRequires(
      next.package.browser,
      packagePath,
    );

    return {
      ...total,
      [next.name]: {
        aliases: browserAliases,
        main: path && (browserAliases[path] || path),
        package: next.package,
      },
    };
  }, {});
}
