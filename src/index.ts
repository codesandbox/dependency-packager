import { Request, Response } from "express";
import * as path from "path";

import installDependencies from "./dependencies/install-dependencies";
import parseDependenciess from "./dependencies/parse-dependencies";

import findRequires from "./packages/find-requires";

import getHash from "./utils/get-hash";

export async function http(req: Request, res: Response) {
  console.log(req.url);
  console.log(req.baseUrl);
  console.log(req.originalUrl);
  const dependencies = await parseDependenciess(req.url);
  const hash = getHash(dependencies);

  const a = Date.now();

  if (!hash) {
    return;
  }

  const packagePath = path.join("/tmp", hash);

  await installDependencies(dependencies, packagePath);

  const requires = await findRequires(dependencies, packagePath);

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
