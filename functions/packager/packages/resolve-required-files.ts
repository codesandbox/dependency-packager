import { fs } from "mz";
import { basename, dirname, join } from "path";
import {
  IPackage,
  PackageImports,
  PackageJsonExports,
} from "./find-package-infos";

const BLACKLISTED_DIRS = [
  "demo",
  "docs",
  "benchmark",
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
    entries
      .map((fPath) => join(path, fPath))
      .map(async (entry) => {
        const meta = await fs.lstat(entry);

        return { entry, isDirectory: meta.isDirectory() };
      }),
  );

  let files = entriesWithMetadata
    .filter((x) => !x.isDirectory)
    .map((x) => x.entry);
  const childFiles = await Promise.all(
    entriesWithMetadata
      .filter((x) => x.isDirectory)
      .map((x) => x.entry)
      .filter((x) => BLACKLISTED_DIRS.indexOf(basename(x)) === -1)
      .filter((x) => !basename(x).startsWith("."))
      .map((dir: string) => getFilePathsInDirectory(dir)),
  );

  childFiles.forEach((f) => {
    files = [...files, ...f];
  });

  return files;
}

const DISALLOWED_EXTENSIONS = ["min.js", "umd.js", "node.js", "test.js"];
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
  return (filePath: string) => {
    const relDirName = filePath.replace(packagePath, "").slice(1);
    if (basename(filePath).startsWith(".")) {
      return false;
    }

    if (
      BLACKLISTED_DIRS.some((dir) => {
        return relDirName.startsWith(dir);
      })
    ) {
      return false;
    }

    if (DISALLOWED_EXTENSIONS.some((ex) => filePath.endsWith(ex))) {
      return false;
    }

    if (ALLOWED_EXTENSIONS.some((ex) => filePath.endsWith(ex))) {
      return true;
    }

    return false;
  };
}

const FALLBACK_DIRS = ["dist", "lib", "build"];
const EXPORTS_KEYS = [
  "browser",
  "development",
  "default",
  "require",
  "import",
] as const;

function getFileFromImport(im: PackageImports & PackageJsonExports): string[] {
  if (typeof im === "string") {
    return [im];
  } else if (Array.isArray(im)) {
    return im;
  } else if ("default" in im) {
    if (!im.default) {
      return [];
    }

    return getFileFromImport(im.default);
  } else {
    const totalExports = [];
    for (exports of Object.values(im)) {
      for (const key of EXPORTS_KEYS) {
        const imports = exports[key];
        if (!imports) {
          continue;
        }
        totalExports.push(...getFileFromImport(imports));
        break;
      }
    }

    return totalExports;
  }
}

function getExports(packageInfo: IPackage): string[] {
  if (!packageInfo.exports) {
    return [];
  }

  return getFileFromImport(packageInfo.exports);
}

export default async function resolveRequiredFiles(
  packagePath: string,
  packageInfo: IPackage,
) {
  const entries = getExports(packageInfo);

  let mains: string[];

  if (entries.length === 0) {
    const main =
      typeof packageInfo.browser === "string"
        ? packageInfo.browser
        : packageInfo.module || packageInfo.main;

    mains = main ? [main] : [];
  } else {
    mains = entries;
  }

  if (mains.length === 0) {
    const indexFileExists = fs.existsSync(join(packagePath, "index.js"));
    if (indexFileExists) {
      mains = ["index.js"];
    }
  }

  // I removed this optimization Our browser and caching strategy is nowadays so sophisticated that
  // this only introduces unnecessary bagage.
  const files: string[] = [];

  if (mains.length > 0) {
    for (const main of mains) {
      [
        join(packagePath, main),
        join(packagePath, main + ".js"),
        join(packagePath, main + ".cjs"),
        join(packagePath, main + ".mjs"),
        join(packagePath, main, "index.js"),
      ].find((p) => {
        try {
          const stat = fs.statSync(p);

          if (stat.isFile()) {
            files.push(p);
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      });
    }
  }

  return files;
}
