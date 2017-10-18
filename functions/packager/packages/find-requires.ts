import { fs } from "mz";
import { dirname, join } from "path";

import { IPackageInfo } from "./find-package-infos";
import resolveRequiredFiles from "./resolve-required-files";
import extractRequires from "./utils/extract-requires";
import nodeResolvePath from "./utils/node-resolve-path";

import * as browserResolve from "browser-resolve";

interface IAliases {
  [alias: string]: string | false | null;
}

interface IFileData {
  [path: string]: {
    content: string;
    requires?: string[];
  };
}

function rewritePath(
  path: string,
  currentPath: string,
  packagePath: string,
  aliases: IAliases,
) {
  const relativePath = nodeResolvePath(join(dirname(currentPath), path));
  const isDependency = /^(\w|@\w)/.test(path);

  if (isDependency) {
    return browserResolve.sync(path, { basedir: dirname(currentPath) });
  }

  if (aliases[path]) {
    return aliases[path];
  }

  return relativePath;
}

function buildRequireObject(
  filePath: string,
  packagePath: string,
  existingContents: IFileData,
  aliases: IAliases,
): IFileData {
  const fileData = getFileData(filePath, existingContents, aliases);

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
      const newPath = rewritePath(requirePath, filePath, packagePath, aliases);

      if (!newPath) {
        return;
      }

      buildRequireObject(newPath, packagePath, existingContents, aliases);
    });

    return existingContents;
  } catch (e) {
    return existingContents;
  }
}

function getFileData(
  filePath: string,
  existingContents: IFileData,
  aliases: IAliases,
) {
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
  packageInfos: { [dep: string]: IPackageInfo },
  aliases: IAliases,
): Promise<{ contents: IFileData; aliases: { [path: string]: string } }> {
  if (!packageInfos[packageName]) {
    return { contents: {}, aliases: {} };
  }

  const packagePath = join(rootPath, "node_modules", packageName);

  const requiredFiles = await resolveRequiredFiles(
    packagePath,
    packageInfos[packageName],
  );

  let files: IFileData = {};

  for (const file of requiredFiles) {
    if (file) {
      const newFiles = await buildRequireObject(
        file,
        packagePath,
        files,
        aliases,
      );
      files = { ...files, ...newFiles };
    }
  }

  const nodeModulesPath = join(rootPath, "node_modules") + "/";
  const relativeFiles = Object.keys(files).reduce(
    (total, next) => ({
      ...total,
      [next.replace(nodeModulesPath, "")]: files[next],
    }),
    {},
  );

  const relativeAliases = Object.keys(aliases).reduce((total, next) => {
    const aliasPath = aliases[next];
    return {
      ...total,
      [next.replace(nodeModulesPath, "")]:
        aliasPath && aliasPath.replace(nodeModulesPath, ""),
    };
  }, {});

  return { contents: relativeFiles, aliases: relativeAliases };
}
