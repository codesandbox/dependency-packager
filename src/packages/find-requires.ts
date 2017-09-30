import { fs } from "mz";
import { dirname, join } from "path";

import findAliases from "./find-aliases";
import extractRequires from "./utils/extract-requires";
import nodeResolvePath from "./utils/node-resolve-path";

interface IAliases {
  [alias: string]: string;
}

function rewritePath(path: string, currentPath: string, aliases: IAliases) {
  const relativePath = nodeResolvePath(join(dirname(currentPath), path));

  if (/^(\w|@\w)/.test(path)) {
    // TODO check if this causes problems in windows
    const parts = path.split("/");

    let pathToAlias;
    let rest;

    if (path.startsWith("@")) {
      pathToAlias = `${parts[0]}/${parts[1]}`;
      rest = parts.slice(2, parts.length);
    } else {
      pathToAlias = parts[0];
      rest = parts.slice(1, parts.length);
    }

    let alias = aliases[pathToAlias];

    if (alias && rest.length) {
      alias = join(dirname(alias), ...rest);
    }

    // it's a dependency
    return alias || relativePath;
  } else {
    return relativePath;
  }
}

function buildRequireObject(
  filePath: string,
  existingContents: { [path: string]: string },
  aliases: IAliases,
): { [path: string]: string } {
  const contents = getRequiresFromFile(filePath, existingContents, aliases);

  if (!contents) {
    return existingContents;
  }

  return extractRequires(contents.content).reduce(
    (total, requirePath) => {
      const newPath = rewritePath(requirePath, filePath, aliases);

      if (!newPath) {
        return total;
      }

      const requiredContents = buildRequireObject(newPath, total, aliases);

      if (requiredContents !== existingContents) {
        return { ...total, ...requiredContents };
      }

      return total;
    },
    { ...existingContents, [contents.path]: contents.content },
  );
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
  packages: IDependencies,
  packagePath: string,
) {
  const aliases = await findAliases(packages, packagePath);

  return Object.keys(packages).reduce((total, packageName) => {
    const newPath = rewritePath(
      packageName,
      join(packagePath, "node_modules"),
      aliases,
    );

    if (!newPath) {
      return total;
    }

    return {
      ...total,
      ...buildRequireObject(newPath, total, aliases),
    };
  }, {});
}
