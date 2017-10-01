import { orderBy } from "lodash";
import { dirname } from "path";

/**
 * Checks if there is an alias given for the path, if there is it will return
 * the altered path, otherwise it will just return the known path.
 */
export default function getAliasedPath(
  path: string,
  aliasObject: { [key: string]: string | false },
): string | null {
  const aliases = Object.keys(aliasObject);

  const pathParts = path.split("/"); // eslint-disable-line prefer-const

  // Find matching aliases
  const foundAlias = orderBy(aliases, a => -a.split("/").length).find(a => {
    const parts = a.split("/");
    return parts.every((p, i) => pathParts[i] === p);
  });

  if (foundAlias) {
    let newAlias = aliasObject[foundAlias];
    if (typeof newAlias !== "string") {
      return null;
    }

    // If there are files after the alias, aliases can point to file and we
    // want to point to the directory in that case
    if (path.split("/").length > foundAlias.split("/").length) {
      newAlias = dirname(newAlias);
    }

    // if an alias is found we will replace the path with the alias
    return path.replace(foundAlias, newAlias);
  }

  return path;
}
