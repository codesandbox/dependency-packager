import * as pacote from "pacote";

/**
 * Gets the absolute versions of all dependencies
 *
 * @param {IDependencies} dependencies
 * @returns
 */
async function getAbsoluteVersion({
  name,
  version,
}: {
  name: string;
  version: string;
}) {
  const depString = `${name}@${version}`;

  try {
    const manifest = await pacote.manifest(depString);

    const absoluteVersion = manifest.version;

    return { name, version: absoluteVersion };
  } catch (e) {
    e.message = `Could not fetch version for ${depString}: ${e.message}`;
    throw e;
  }
}

/**
 * This filters all dependencies that are not needed for CodeSandbox and normalizes
 * the versions from semantic to absolute version, eg: ^1.0.0 -> 1.2.1
 *
 * @export
 * @param {object} dependencies
 */
export default async function mapDependencies(dependency: {
  name: string;
  version: string;
}) {
  const absoluteDependencies = await getAbsoluteVersion(dependency);

  return absoluteDependencies;
}
