import { fs } from "mz";
import { dirname, join } from "path";

import { IPackage } from "./find-package-infos";
import resolveRequiredFiles from "./resolve-required-files";
import extractRequires from "./utils/extract-requires";
import nodeResolvePath from "./utils/node-resolve-path";

import * as browserResolve from "browser-resolve";

interface IAliases {
  [alias: string]: string | false | null;
}

export interface IFileData {
  [path: string]: {
    content: string;
    requires?: string[];
  };
}

function rewritePath(path: string, currentPath: string, packagePath: string) {
  const relativePath = nodeResolvePath(join(dirname(currentPath), path));
  const isDependency = /^(\w|@\w)/.test(path);

  return browserResolve.sync(path, { filename: currentPath });
}

function buildRequireObject(
  filePath: string,
  packagePath: string,
  existingContents: IFileData,
): IFileData {
  const fileData = getFileData(filePath, existingContents);

  if (!fileData) {
    return existingContents;
  }

  existingContents[fileData.path] = {
    content: fileData.content,
  };

  if (!fileData.path.endsWith(".js")) {
    return existingContents;
  }

  try {
    const extractedRequires = extractRequires(fileData.content);
    existingContents[fileData.path].requires = extractedRequires;

    extractedRequires.forEach(requirePath => {
      const newPath = rewritePath(requirePath, filePath, packagePath);

      if (!newPath) {
        return;
      }

      buildRequireObject(newPath, packagePath, existingContents);
    });

    return existingContents;
  } catch (e) {
    return existingContents;
  }
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

  for (const file of requiredFiles) {
    if (file) {
      const newFiles = await buildRequireObject(file, packagePath, files);
      files = { ...files, ...newFiles };
    }
  }

  const relativeFiles = Object.keys(files).reduce(
    (total, next) => ({
      ...total,
      [next.replace(rootPath, "")]: files[next],
    }),
    {},
  );

  return relativeFiles;
}
