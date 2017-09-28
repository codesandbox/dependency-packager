import * as pacote from 'pacote';

/**
 * Checks if all peer dependencies are in the package dependencies
 *
 * @param {IDependencies} dependencies
 * @param {IDependencies} peerDependencies
 */
function checkPeerDependencies(
  dependencies: IDependencies,
  peerDependencies: Object
) {
  const peerDeps = Object.keys(peerDependencies);
  for (let i = 0; i < peerDeps.length; i++) {
    // If the peer dependency is missing
    if (!dependencies[peerDeps[i]]) {
      throw new Error(`Missing peer dependency: '${peerDeps[i]}'`);
    }
  }
}

/**
 * Gets the absolute versions of all dependencies
 *
 * @param {IDependencies} dependencies
 * @returns
 */
async function getAbsoluteVersions(dependencies: IDependencies) {
  const dependencyNames = Object.keys(dependencies);

  // First build an array with name and absolute version, allows parallel
  // fetching of version numbers
  const absoluteDependencies = await Promise.all(
    dependencyNames.map(async depName => {
      const depString = `${depName}@${dependencies[depName]}`;

      try {
        const manifest = await pacote.manifest(depString);

        if (manifest.peerDependencies) {
          checkPeerDependencies(dependencies, manifest.peerDependencies);
        }

        const absoluteVersion = manifest.version;

        return { name: depName, version: absoluteVersion };
      } catch (e) {
        e.message = `Could not fetch version for ${depString}: ${e.message}`;
        throw e;
      }
    })
  );

  return absoluteDependencies.reduce((total: IDependencies, next) => {
    total[next.name] = next.version;
    return total;
  }, {});
}

/**
 * This filters all dependencies that are not needed for CodeSandbox and normalizes
 * the versions from semantic to absolute version, eg: ^1.0.0 -> 1.2.1
 *
 * @export
 * @param {object} dependencies
 */
export default async function mapDependencies(dependencies: IDependencies) {
  console.log('oka');
  const absoluteDependencies = await getAbsoluteVersions(dependencies);

  return absoluteDependencies;
}
