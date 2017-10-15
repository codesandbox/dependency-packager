import { flatten } from "lodash";
import { fs } from "mz";
import { basename, dirname, join } from "path";
import { IPackageInfo } from "./find-package-infos";

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
  "testing",
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

function isValidFile(filePath: string) {
  if (basename(filePath).startsWith(".")) {
    return false;
  }

  if (DISALLOWED_EXTENSIONS.some(ex => filePath.endsWith(ex))) {
    return false;
  }

  if (ALLOWED_EXTENSIONS.some(ex => filePath.endsWith(ex))) {
    return true;
  }

  return false;
}

const FALLBACK_DIRS = ["dist", "lib", "build"];

export default async function resolveRequiredFiles(
  packagePath: string,
  packageInfo: IPackageInfo,
) {
  const main = packageInfo.main;

  let entryDir;

  if (!main) {
    entryDir = FALLBACK_DIRS.map(d => join(packagePath, d)).find(
      dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory(),
    );
  } else {
    entryDir = dirname(main);
  }

  if (!entryDir) {
    return [];
  }

  const files = await getFilePathsInDirectory(entryDir);

  return [...files.filter(isValidFile), main];
}
