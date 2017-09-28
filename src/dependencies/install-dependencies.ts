import { exec } from 'child_process';
import { join } from 'path';

export default function(packages: IDependencies, packagePath: string) {
  const parsedDependencies = Object.keys(packages).map(
    name => `${name}@${packages[name]}`
  );
  return new Promise(function(resolve, reject) {
    exec(
      `mkdir -p ${packagePath} && cd ${packagePath} && HOME=/tmp node ${join(
        __dirname,
        '../../node_modules',
        'yarn',
        'lib',
        'cli'
      )} add ${parsedDependencies.join(
        ' '
      )} node-libs-browser --no-lockfile --ignore-scripts --non-interactive --no-bin-links --no-lockfile --ignore-engines`,
      function(err, stdout, stderr) {
        if (err) {
          reject(
            err.message.indexOf('versions') >= 0
              ? new Error('INVALID_VERSION')
              : err
          );
        } else {
          resolve();
        }
      }
    );
  });
}
