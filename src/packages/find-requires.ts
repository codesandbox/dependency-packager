import { fs } from "mz";
import { dirname, join } from "path";

import findAliases from "./find-aliases";
import resolveRequiredFiles from "./resolve-required-files";
import extractRequires from "./utils/extract-requires";
import getAliasedPath from "./utils/get-aliased-path";
import nodeResolvePath from "./utils/node-resolve-path";

interface IAliases {
  [alias: string]: string;
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

  return aliases[newPath] || newPath;
}

function buildRequireObject(
  filePath: string,
  packagePath: string,
  existingContents: { [path: string]: string },
  aliases: IAliases,
): { [path: string]: string } {
  const contents = getRequiresFromFile(filePath, existingContents, aliases);

  if (!contents) {
    return existingContents;
  }

  const newContents = {
    ...existingContents,
    [contents.path]: contents.content,
  };

  if (!contents.path.endsWith(".js")) {
    return newContents;
  }

  return extractRequires(contents.content).reduce((total, requirePath) => {
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

    if (requiredContents !== existingContents) {
      return { ...total, ...requiredContents };
    }

    return total;
  }, newContents);
}

function getRequiresFromFile(
  filePath: string,
  existingContents: { [path: string]: string },
  aliases: IAliases,
) {
  const resolvedPath = nodeResolvePath(filePath);
  if (!resolvedPath) {
    console.log('Warning: could not find "' + filePath + '"');
    return null;
  }

  if (existingContents[resolvedPath]) {
    return null;
  }

  return {
    content: fs.readFileSync(resolvedPath).toString(),
    path: resolvedPath,
  };
}

export default async function findRequires(
  packageName: string,
  rootPath: string,
) {
  const packageInfos = await findAliases(packageName, rootPath);

  if (!packageInfos[packageName]) {
    return;
  }

  const packagePath = join(rootPath, "node_modules", packageName);

  const requiredFiles = await resolveRequiredFiles(
    packagePath,
    packageInfos[packageName],
  );

  const aliases = Object.keys(packageInfos).reduce((total, name) => {
    const browserField = packageInfos[name].package.browser;
    const browserAliases = typeof browserField === "object" ? browserField : {};
    return {
      ...total,
      [name]: packageInfos[name].main,
      ...browserAliases,
    };
  }, {});

  let files = {};

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

  return files;
}
