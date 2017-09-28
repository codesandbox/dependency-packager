import { join, dirname } from 'path';
import { fs } from 'mz';

import findAliases from './find-aliases';
import extractRequires from './utils/extract-requires';

interface Aliases {
  [alias: string]: string;
}

function resolvePath(path: string, currentPath: string, aliases: Aliases) {
  const relativePath = join(dirname(currentPath), path);

  if (/^(\w|@\w)/.test(path)) {
    // TODO check if this causes problems in windows
    const parts = path.split('/');

    let pathToAlias;
    let rest;

    if (path.startsWith('@')) {
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

function getContents(path: string) {
  if (fs.existsSync(path)) {
    return fs.readFile(path);
  } else if (fs.existsSync(path + '.js')) {
    return fs.readFile(path + '.js');
  } else if (fs.existsSync(path + '.json')) {
    return fs.readFile(path + '.json');
  }

  throw new Error('Could not find ' + path);
}

async function getRequiresFromFile(
  filePath: string,
  existingContents: { [path: string]: string },
  aliases: Aliases
): Promise<any> {
  if (existingContents[filePath]) {
    return existingContents;
  }

  const contents = (await getContents(filePath)).toString();

  existingContents[filePath] = contents;

  const requires = extractRequires(contents);

  return Promise.all(
    requires.map(require => {
      if (/\.min\./.test(require)) {
        return Promise.resolve();
      }

      return getRequiresFromFile(
        resolvePath(require, filePath, aliases),
        existingContents,
        aliases
      );
    })
  );
}

export default async function findRequires(
  packages: IDependencies,
  packagePath: string
) {
  const aliases = await findAliases(packages, packagePath);
  console.log(aliases);

  const files = {};

  await Promise.all(
    Object.keys(packages).map(packageName => {
      const filePath = resolvePath(
        packageName,
        join(packagePath, 'node_modules'),
        aliases
      );

      if (fs.existsSync(filePath)) {
        return getRequiresFromFile(filePath, files, aliases);
      }
    })
  );

  return files;
}
