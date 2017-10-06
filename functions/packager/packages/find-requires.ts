import { fs } from "mz";
import { dirname, join } from "path";

import { IPackageInfo } from "./find-package-infos";
import resolveRequiredFiles from "./resolve-required-files";
import extractRequires from "./utils/extract-requires";
import nodeResolvePath from "./utils/node-resolve-path";

interface IAliases {
  [alias: string]: string | false | null;
}

interface IFileData {
  [path: string]: {
    content: string;
    requires: string[];
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

  // TODO support for @packages
  const newPath = isDependency ? join(packagePath, "../", path) : relativePath;

  if (!newPath) {
    return null;
  }

  if (aliases[path]) {
    return aliases[path];
  }

  const nodeResolvedNewPath = nodeResolvePath(newPath);
  if (nodeResolvedNewPath && aliases[nodeResolvedNewPath]) {
    return aliases[nodeResolvedNewPath];
  }

  return newPath;
}

function buildRequireObject(
  filePath: string,
  packagePath: string,
  existingContents: IFileData,
  aliases: IAliases,
): IFileData {
  const contents = getRequiresFromFile(filePath, existingContents, aliases);

  if (!contents) {
    return existingContents;
  }

  const newContents = {
    ...existingContents,
    [contents.path]: {
      requires: contents.requiredPaths,
      content: contents.content,
    },
  };

  if (!contents.path.endsWith(".js")) {
    return newContents;
  }

  try {
    const extractedRequires = extractRequires(contents.content);
    return extractedRequires.reduce((total, requirePath) => {
      const newPath = rewritePath(requirePath, filePath, packagePath, aliases);

      if (!newPath) {
        return total;
      }

      const requiredContents = buildRequireObject(
        newPath,
        packagePath,
        total,
        aliases,
      );

      // If something was added to the total
      if (requiredContents !== existingContents) {
        return { ...total, ...requiredContents };
      }

      return total;
    }, newContents);
  } catch (e) {
    return newContents;
  }
}

function getRequiresFromFile(
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

  const fileData: { path: string; content: string; requiredPaths: string[] } = {
    path: resolvedPath,
    content: fs.readFileSync(resolvedPath).toString(),
    requiredPaths: [],
  };

  try {
    fileData.requiredPaths = extractRequires(fileData.content);
  } catch (e) {
    /* Do nothing with it */
  }

  return fileData;
}

export default async function findRequires(
  packageName: string,
  rootPath: string,
  packageInfos: { [dep: string]: IPackageInfo },
  aliases: IAliases,
) {
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
