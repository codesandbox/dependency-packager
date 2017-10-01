import mapDependency from "./utils/dependency-mapper";

export default async function parseDependencies(url: string) {
  const parts = url.replace("/", "").split("@");
  const version = parts.pop();

  return await mapDependency({
    name: parts.join("@"),
    version: version || "latest",
  });
}
