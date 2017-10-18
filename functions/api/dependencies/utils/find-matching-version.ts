import * as s from "semver";

export default function findMatchingVersion(
  versions: string[],
  semver: string,
) {
  return versions.find(v => s.intersects(semver, semver));
}
