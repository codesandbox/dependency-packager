import * as JSON5 from "json5";
import { flatten } from "lodash";
import { fs } from "mz";
import { dirname, join } from "path";
import * as recursiveReaddir from "recursive-readdir";
import { IPackage } from "./find-package-infos";
import { IFileData } from "./find-requires";

export function isReason(packageName: string, rootPath: string) {
  const bsConfigPath = join(
    rootPath,
    "node_modules",
    packageName,
    "bsconfig.json",
  );

  return fs.existsSync(bsConfigPath);
}

export async function getReasonFiles(
  rootPath: string,
  packageInfos: { [dep: string]: IPackage },
): Promise<IFileData> {
  const nModulesPath = join(rootPath, "node_modules");
  const reasonDependencies = Object.keys(packageInfos)
    .map(x => packageInfos[x].name)
    .filter(x => isReason(x, rootPath));

  const files: IFileData = {};

  await Promise.all(
    reasonDependencies.map(async packageName => {
      const packagePath = join(rootPath, "node_modules", packageName);
      const bsConfigPath = join(packagePath, "bsconfig.json");

      const bsConfig = await fs
        .readFile(bsConfigPath)
        .then(data => JSON5.parse(data.toString()));

      const sources: Array<
        | string
        | { dir: string; type?: "src" | "dev"; subdirs?: string[] | boolean }
      > =
        typeof bsConfig.sources === "string"
          ? [bsConfig.sources]
          : bsConfig.sources;

      const sourcePaths: Array<string | string[]> = (await Promise.all(
        sources.map(async srcSpec => {
          if (typeof srcSpec === "string") {
            return join(packagePath, srcSpec);
          }

          if (!srcSpec.type || srcSpec.type === "src") {
            if (!("subdirs" in srcSpec) || srcSpec.subdirs === false) {
              return join(packagePath, srcSpec.dir);
            }

            if (Array.isArray(srcSpec.subdirs)) {
              return srcSpec.subdirs.map(subdir => join(packagePath, subdir));
            } else {
              // Read all subdirs
              return recursiveReaddir(packagePath).then(f =>
                f
                  .filter(p => fs.lstatSync(p).isDirectory()),
              );
            }
          } else {
            return undefined;
          }
        }),
      )).filter(Boolean) as Array<string | string[]>;

      const flattenedSources = flatten(sourcePaths);

      return Promise.all(
        flattenedSources.map(async directory => {
          const reFiles = (await fs.readdir(directory))
            .map(x => join(directory, x))
            .filter(x => fs.lstatSync(x).isFile())
            .filter(x => /\.rei?$/.test(x) || /\.mli?$/.test(x));

          return Promise.all(
            reFiles.map(async filePath => {
              const fileContents = await fs.readFile(filePath);
              files[filePath] = {
                content: fileContents.toString(),
              };
            }),
          );
        }),
      );
    }),
  );

  return files;
}
