import { Request, Response } from "express";
import * as path from "path";

import installDependencies from "./dependencies/install-dependencies";
import parseDependency from "./dependencies/parse-dependency";

import findPackageInfos from "./packages/find-package-infos";
import findRequires from "./packages/find-requires";

import getHash from "./utils/get-hash";

export async function http(req: Request, res: Response) {
  try {
    const dependency = await parseDependency(req.url);
    const hash = getHash(dependency);

    const a = Date.now();

    if (!hash) {
      return;
    }

    const packagePath = path.join("/tmp", hash);

    await installDependencies(dependency, packagePath);

    const packageInfos = await findPackageInfos(dependency.name, packagePath);

    const aliases = Object.keys(packageInfos).reduce(
      (total, name) => ({
        ...total,
        [name]: packageInfos[name].main,
        ...packageInfos[name].aliases,
      }),
      {},
    );

    const { contents, aliases: newAliases } = await findRequires(
      dependency.name,
      packagePath,
      packageInfos,
      aliases,
    );

    const packages = Object.keys(packageInfos).reduce(
      (total, packageName) => ({
        ...total,
        [packageName]: packageInfos[packageName].package,
      }),
      {},
    );

    console.log("Done - " + (Date.now() - a) + " - " + packagePath);
    res.json({
      aliases: newAliases,
      contents,
      dependency,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

if (process.env.LOCAL) {
  const express = require("express");

  const app = express();

  app.get("/*", http);

  app.listen(8080, () => {
    console.log("Listening on port 8080");
  });
}
