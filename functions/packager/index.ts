import { Callback, Context } from "aws-lambda";
import { S3 } from "aws-sdk";

import * as path from "path";
import * as Raven from "raven";
import * as rimraf from "rimraf";

import findDependencyDependencies from "./dependencies/find-dependency-dependencies";
import installDependencies from "./dependencies/install-dependencies";
import parseDependency from "./dependencies/parse-dependency";

import findPackageInfos, { IPackage } from "./packages/find-package-infos";
import findRequires, { IFileData } from "./packages/find-requires";

import getHash from "./utils/get-hash";

import env from "./config.secret";

const { BUCKET_NAME } = process.env;

Raven.config(env.SENTRY_URL).install();

const s3 = new S3();

async function getContents(
  dependency: any,
  packagePath: string,
  packageInfos: { [p: string]: IPackage },
): Promise<IFileData> {
  const contents = await findRequires(
    dependency.name,
    packagePath,
    packageInfos,
  );

  const packageJSONFiles = Object.keys(packageInfos).reduce(
    (total, next) => ({
      ...total,
      [next.replace(packagePath, "")]: {
        content: JSON.stringify(packageInfos[next]),
      },
    }),
    {},
  );

  return { ...contents, ...packageJSONFiles };
}

export async function call(event: any, context: Context, cb: Callback) {
  /** Immediate response for WarmUP plugin */
  if (event.source === "serverless-plugin-warmup") {
    console.log("WarmUP - Lambda is warm!");
    return cb(undefined, "Lambda is warm!");
  }

  const dependency = event;
  const hash = getHash(dependency);
  const t = Date.now();

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

    // Install git binaries
    /* tslint:disable no-var-requires */
    require("lambda-git")();
    /* tslint:enable */

    const packagePath = path.join("/tmp", hash);

    await installDependencies(dependency, packagePath);

    const packageInfos = await findPackageInfos(dependency.name, packagePath);
    const contents = await getContents(dependency, packagePath, packageInfos);

    console.log(
      "Done - " +
        (Date.now() - t) +
        " - " +
        dependency.name +
        "@" +
        dependency.version,
    );

    const requireStatements = new Set();
    Object.keys(contents).forEach(p => {
      const c = contents[p];

      if (c.requires) {
        c.requires.forEach(r => requireStatements.add(r));
      }
    });

    const response = {
      contents,
      dependency,
      ...findDependencyDependencies(
        dependency,
        packagePath,
        packageInfos,
        requireStatements,
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
  /* tslint:disable no-var-requires */
  const express = require("express");
  /* tslint:enable */

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
