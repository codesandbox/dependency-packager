import { fs } from "mz";
import { dirname, join } from "path";

import { IPackage } from "./find-package-infos";
import resolveRequiredFiles from "./resolve-required-files";
import extractRequires from "./utils/extract-requires";
import nodeResolvePath from "./utils/node-resolve-path";

import * as resolve from "enhanced-resolve";
// @ts-ignore
import * as readFiles from "recursive-readdir-sync";
import { getReasonFiles, isReason } from "./reason-downloader";
import { packageFilter } from "../utils/resolver";

interface IAliases {
  [alias: string]: string | false | null;
}

export interface IFileData {
  [path: string]: {
    content: string;
    isModule: boolean;
    requires?: string[];
  };
}
const customResolve = resolve.create({
  exportsFields: ["exports"],
  conditionNames: ["browser", "development", "default", "require", "import"],
});

function rewritePath(
  path: string,
  currentPath: string,
  packagePath: string,
): Promise<string | false | undefined> {
  return new Promise((resolve, reject) => {
    customResolve(dirname(currentPath), path, (err, res) => {
      if (err) {
        resolve(false);
        return;
      }

      resolve(res);
    });
  });
}

async function buildRequireObject(
  filePath: string,
  packagePath: string,
  existingContents: IFileData,
): Promise<IFileData> {
  const fileData = getFileData(filePath, existingContents);

  if (!fileData) {
    return existingContents;
  }

  existingContents[fileData.path] = {
    content: fileData.content,
    isModule: false,
  };

  if (
    !fileData.path.endsWith(".js") &&
    !fileData.path.endsWith(".mjs") &&
    !fileData.path.endsWith(".cjs")
  ) {
    return existingContents;
  }

  let extractedRequires = null;
  try {
    extractedRequires = extractRequires(fileData.content);
  } catch (e) {
    return existingContents;
  }

  existingContents[fileData.path].requires = extractedRequires.requires;
  existingContents[fileData.path].isModule = extractedRequires.isModule;

  await Promise.all(
    (extractedRequires.requires || []).map(async (requirePath) => {
      let newPaths: string[] = [];
      try {
        if (requirePath.startsWith("glob:")) {
          const originalPath = requirePath.replace("glob:", "");

          const files: string[] = readFiles(
            join(dirname(filePath), originalPath),
          );

          newPaths = (
            await Promise.all(
              files
                .filter((p) => p.endsWith(".js"))
                .map((p) => rewritePath(p, filePath, packagePath)),
            )
          ).filter(Boolean) as string[];
        } else {
          newPaths = [
            await rewritePath(requirePath, filePath, packagePath),
          ].filter(Boolean) as string[];
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`Couldn't find ${requirePath}`);
        }
        return;
      }

      if (newPaths.length === 0) {
        return;
      }

      await Promise.all(
        newPaths.map((newPath) =>
          buildRequireObject(newPath, packagePath, existingContents),
        ),
      );
    }),
  );

  return existingContents;
}

function getFileData(filePath: string, existingContents: IFileData) {
  const resolvedPath = nodeResolvePath(filePath);
  if (!resolvedPath) {
    // console.log('Warning: could not find "' + filePath + '"');
    return null;
  }

  if (existingContents[resolvedPath]) {
    return null;
  }

  const fileData: { path: string; content: string } = {
    path: resolvedPath,
    content: fs.readFileSync(resolvedPath).toString(),
  };

  return fileData;
}

export default async function findRequires(
  packageName: string,
  rootPath: string,
  packageInfos: { [dep: string]: IPackage },
): Promise<IFileData> {
  const packagePath = join(rootPath, "node_modules", packageName);
  const packageJSONPath = join(
    rootPath,
    "node_modules",
    packageName,
    "package.json",
  );

  if (!packageInfos[packageJSONPath]) {
    return {};
  }

  const requiredFiles = await resolveRequiredFiles(
    packagePath,
    packageInfos[packageJSONPath],
  );

  let files: IFileData = {};

  if (isReason(packageName, rootPath)) {
    files = await getReasonFiles(rootPath, packageInfos);
  }

  for (const file of requiredFiles) {
    if (file) {
      const newFiles = await buildRequireObject(file, packagePath, files);
      files = { ...files, ...newFiles };
    }
  }

  const sizeMB = JSON.stringify(files).length / 1024 / 1024;

  // If the response is bigger than 8 mb(!) and there is no main file we just
  // include the default included files. Let the client decide which other files
  // to download.
  const relativeFiles =
    packageName === "node-libs-browser" ||
    (sizeMB > 8 &&
      !packageInfos[packageJSONPath].main &&
      !packageInfos[packageJSONPath].module &&
      !packageInfos[packageJSONPath].unpkg)
      ? {}
      : Object.keys(files).reduce(
          (total, next) => ({
            ...total,
            [next.replace(rootPath, "")]: files[next],
          }),
          {},
        );

  return relativeFiles;
}
