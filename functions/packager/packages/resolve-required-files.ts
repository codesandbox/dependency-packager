import { flatten } from "lodash";
import { fs } from "mz";
import { basename, dirname, join } from "path";
import { IPackage } from "./find-package-infos";

const BLACKLISTED_DIRS = [
  "demo",
  "docs",
  "benchmark",
  "es6",
  "es",
  "flow-typed",
  "src",
  "bundles",
  "examples",
  "scripts",
  "tests",
  "test",
  "umd",
  "min",
  "node_modules",
];

async function getFilePathsInDirectory(path: string): Promise<string[]> {
  const entries = await fs.readdir(path);

  const entriesWithMetadata = await Promise.all(
    entries.map(fPath => join(path, fPath)).map(async entry => {
      const meta = await fs.lstat(entry);

      return { entry, isDirectory: meta.isDirectory() };
    }),
  );

  let files = entriesWithMetadata.filter(x => !x.isDirectory).map(x => x.entry);
  const childFiles = await Promise.all(
    entriesWithMetadata
      .filter(x => x.isDirectory)
      .map(x => x.entry)
      .filter(x => BLACKLISTED_DIRS.indexOf(basename(x)) === -1)
      .filter(x => !basename(x).startsWith("."))
      .map((dir: string) => getFilePathsInDirectory(dir)),
  );

  childFiles.forEach(f => {
    files = [...files, ...f];
  });

  return files;
}

const DISALLOWED_EXTENSIONS = [
  "min.js",
  "umd.js",
  "node.js",
  "test.js",
  "esm.js",
  "cjs.js",
  "module.js",
];
const ALLOWED_EXTENSIONS = [
  "json",
  "js",
  "css",
  "scss",
  "styl",
  "less",
  "vue",
  "html",
];

function isValidFile(packagePath: string, packageInfo: IPackage) {
  let moduleDir = null;
  let es2015Dir = null;

  // We don't want to include es2015 and modules folders if we have a main file.
  // For example, if you have this file structure:

  /*
  - es2015
    - index.js
  - es5
    - index.js
  - index.js (main)
  */

  // We only want to include the index.js and not those subdirs. An example of this
  // is rxjs.
  if (packageInfo.module) {
    moduleDir = dirname(join(packagePath, packageInfo.module))
      .replace(packagePath, "")
      .slice(1);
  }

  if (packageInfo.es2015) {
    es2015Dir = dirname(join(packagePath, packageInfo.es2015))
      .replace(packagePath, "")
      .slice(1);
  }

  const blackListedDirs = [...BLACKLISTED_DIRS, moduleDir, es2015Dir].filter(
    Boolean,
  ) as string[];

  return (filePath: string) => {
    const relDirName = filePath.replace(packagePath, "").slice(1);
    if (basename(filePath).startsWith(".")) {
      return false;
    }

    if (
      blackListedDirs.some(dir => {
        return relDirName.startsWith(dir);
      })
    ) {
      return false;
    }

    if (DISALLOWED_EXTENSIONS.some(ex => filePath.endsWith(ex))) {
      return false;
    }

    if (ALLOWED_EXTENSIONS.some(ex => filePath.endsWith(ex))) {
      return true;
    }

    return false;
  };
}

const FALLBACK_DIRS = ["dist", "lib", "build"];

export default async function resolveRequiredFiles(
  packagePath: string,
  packageInfo: IPackage,
) {
  let main =
    typeof packageInfo.browser === "string"
      ? packageInfo.browser
      : packageInfo.main;

  let entryDir;

  if (!main) {
    const indexFileExists = fs.existsSync(join(packagePath, "index.js"));
    if (indexFileExists) {
      main = "index.js";
      entryDir = packagePath;
    } else {
      entryDir = FALLBACK_DIRS.map(d => join(packagePath, d)).find(
        dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory(),
      );
    }
  } else {
    entryDir = join(packagePath, dirname(main));
  }

  if (!entryDir) {
    return [];
  }

  const browser =
    typeof packageInfo.browser === "object" ? packageInfo.browser : {};

  const browserAliases: { [p: string]: string | false } = Object.keys(
    browser,
  ).reduce((total, path: string) => {
    const relativePath = join(packagePath, path);
    let resolvedPath = browser[path];
    if (resolvedPath !== false) {
      resolvedPath = join(packagePath, resolvedPath);
    }

    return {
      ...total,
      [relativePath]: resolvedPath,
    };
  }, {});

  const isValidFileTest = isValidFile(entryDir, packageInfo);
  const files: string[] = (await getFilePathsInDirectory(entryDir))
    .filter(isValidFileTest)
    .map(path => {
      if (typeof browserAliases === "object") {
        if (browserAliases[path] === false) {
          return null;
        }

        if (browserAliases[path]) {
          return browserAliases[path];
        }
      }
      return path;
    })
    .filter(x => x != null) as string[];

  if (main) {
    files.push(join(packagePath, main));
  }

  return files;
}
