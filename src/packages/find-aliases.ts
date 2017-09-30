import { fs } from 'mz';
import { join } from 'path';

function getDirectories(path: string) {
  const directories = fs.readdirSync(path);

  return directories
    .filter(file => !file.startsWith('.'))
    .filter(file => fs.lstatSync(join(path, file)).isDirectory());
}

interface Package {
  name: string;
  main?: string;
  browser?: string;
}

export default async function findAliases(
  packages: IDependencies,
  packagePath: string
): Promise<{ [depName: string]: string }> {
  const directories = getDirectories(
    join(packagePath, 'node_modules')
  ).reduce((total, next) => {
    if (next.startsWith('@')) {
      // We will check what inside this directory if it starts with an @, because
      // this means that it's under an organization

      return [
        ...total,
        ...getDirectories(join(packagePath, 'node_modules', next)).map(dir =>
          join(next, dir)
        ),
      ];
    }

    return [...total, next];
  }, []);

  const packageJSONs = await Promise.all(
    directories.map(async packageName => {
      const contents = await fs.readFile(
        join(packagePath, 'node_modules', packageName, 'package.json')
      );

      const pkg: Package = JSON.parse(contents.toString());

      return { name: packageName, package: pkg };
    })
  );

  return packageJSONs.reduce((total, next) => {
    // We use the browser field if it is a string (not an object) and exists
    const hasBrowser = typeof next.package.browser === 'string';
    const main = hasBrowser ? next.package.browser : next.package.main;

    const path = main
      ? join(packagePath, 'node_modules', next.name, main)
      : join(packagePath, 'node_modules', next.name, 'index.js');

    return { ...total, [next.name]: path };
  }, {});
}
