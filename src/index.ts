import { Request, Response } from 'express';
import * as path from 'path';

import parseDependenciess from './dependencies/parse-dependencies';
import installDependencies from './dependencies/install-dependencies';

import findRequires from './packages/find-requires';

import getHash from './utils/get-hash';

export async function hello(req: Request, res: Response) {
  const dependencies = await parseDependenciess(req.url);
  const hash = getHash(dependencies);

  const a = Date.now();

  if (!hash) {
    return;
  }

  const packagePath = path.join('/tmp', hash);

  await installDependencies(dependencies, packagePath);

  const requires = await findRequires(dependencies, packagePath);

  console.log('Done - ' + (Date.now() - a) + ' - ' + packagePath);
  res.json(requires);
}

if (process.env.LOCAL) {
  const express = require('express');

  const app = express();

  app.get('/*', hello);

  app.listen(8080, () => {
    console.log('listening');
  });
}
