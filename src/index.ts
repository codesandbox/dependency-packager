import { Request, Response } from "express";
import * as path from "path";

import installDependencies from "./dependencies/install-dependencies";
import parseDependency from "./dependencies/parse-dependency";

import findRequires from "./packages/find-requires";

import getHash from "./utils/get-hash";

export async function http(req: Request, res: Response) {
  const dependency = await parseDependency(req.url);
  const hash = getHash(dependency);

  const a = Date.now();

  if (!hash) {
    return;
  }

  const packagePath = path.join("/tmp", hash);

  await installDependencies(dependency, packagePath);

  const requires = await findRequires(dependency.name, packagePath);

  console.log("Done - " + (Date.now() - a) + " - " + packagePath);
  res.json(requires);
}

if (process.env.LOCAL) {
  const express = require("express");

  const app = express();

  app.get("/*", http);

  app.listen(8080, () => {
    console.log("listening");
  });
}
