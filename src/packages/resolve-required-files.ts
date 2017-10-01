import { flatten } from "lodash";
import { fs } from "mz";
import { basename, dirname, join } from "path";
import { IPackageInfo } from "./find-aliases";

const BLACKLISTED_DIRS = ["umd", "tests"];

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
      .map((dir: string) => getFilePathsInDirectory(dir)),
  );

  childFiles.forEach(f => {
    files = [...files, ...f];
  });

  return files;
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

  return files
    .filter(p => p.endsWith(".js"))
    .filter(p => !p.endsWith(".min.js"));
}
