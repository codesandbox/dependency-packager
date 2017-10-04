import { Callback, Context } from "aws-lambda";
import { S3 } from "aws-sdk";
import * as path from "path";

import * as rimraf from "rimraf";

import * as Raven from "raven";

import installDependencies from "./dependencies/install-dependencies";
import parseDependency from "./dependencies/parse-dependency";

import findPackageInfos from "./packages/find-package-infos";
import findRequires from "./packages/find-requires";

import getHash from "./utils/get-hash";

import env from "./config.secret";

const { BUCKET_NAME } = process.env;

Raven.config(env.SENTRY_URL).install();

const s3 = new S3();

export async function call(event: any, context: Context, cb: Callback) {
  /** Immediate response for WarmUP plugin */
  if (event.source === "serverless-plugin-warmup") {
    console.log("WarmUP - Lambda is warm!");
    return cb(undefined, "Lambda is warm!");
  }

  const dependency = event;
  const hash = getHash(dependency);
  const a = Date.now();

  if (!hash) {
    return;
  }
  try {
    // Cleanup
    try {
      rimraf.sync("/tmp/*");
    } catch (e) {
      /* ignore */
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

    const response = {
      aliases: newAliases,
      contents,
      dependency,
      dependencyDependencies: Object.keys(packageInfos)
        .filter(x => x !== dependency.name)
        .reduce(
          (total, depName) => ({
            ...total,
            [depName]: packageInfos[depName].package.version,
          }),
          {},
        ),
    };

    if (process.env.IN_LAMBDA) {
      if (!BUCKET_NAME) {
        throw new Error("No bucket has been specified");
      }

      s3.putObject(
        {
          Body: JSON.stringify(response),
          Bucket: BUCKET_NAME,
          Key: `packages/${dependency.name}/${dependency.version}.json`,
          ACL: "public-read",
          ContentType: "application/json",
        },
        err => {
          if (err) {
            console.log(err);
            throw err;
          }
        },
      );
    }

    cb(undefined, response);
  } catch (e) {
    Raven.captureException(
      e,
      {
        tags: {
          hash,
          dependency: `${dependency.name}@${dependency.version}`,
        },
      },
      () => {
        cb(e);
      },
    );
  }
}

if (!process.env.IN_LAMBDA) {
  const express = require("express");

  const app = express();

  app.get("/*", (req: any, res: any) => {
    const packageParts = req.url.replace("/", "").split("@");
    const version = packageParts.pop();

    const ctx = {} as Context;
    const dep = { name: packageParts.join("@"), version };

    console.log(dep);
    call(dep, ctx, (err: any, result: any) => {
      console.log(err);

      res.json(result);
    });
  });

  app.listen(4545, () => {
    /*es*/
  });
}
