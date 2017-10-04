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

/* tslint:disable no-var-requires */
const env = require("./environment.json");
/* tslint:enable */

const { BUCKET_NAME } = process.env;

Raven.config(env.SENTRY_KEY).install();

const s3 = new S3();

export async function call(event: any, context: Context, cb: Callback) {
  const dependency = event;
  const hash = getHash(dependency);
  const a = Date.now();

  if (!hash) {
    return;
  }
  try {
    // Cleanup
    rimraf.sync("/tmp/*");

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
        }

        throw err;
      },
    );

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
