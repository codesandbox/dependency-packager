import { Callback, Context } from "aws-lambda";
import { S3 } from "aws-sdk";

import { fs } from "mz";
import * as path from "path";
import * as Raven from "raven";
import * as rimraf from "rimraf";
import * as zlib from "zlib";

import findDependencyDependencies from "./dependencies/find-dependency-dependencies";
import installDependencies from "./dependencies/install-dependencies";

import findPackageInfos, { IPackage } from "./packages/find-package-infos";
import findRequires, { IFileData } from "./packages/find-requires";

import getHash from "./utils/get-hash";

import { VERSION } from "../config";
import env from "./config.secret";

const { BUCKET_NAME } = process.env;

if (env.SENTRY_URL) {
  Raven.config(env.SENTRY_URL!).install();
}

const s3 = new S3();

/**
 * Remove a file from the content
 *
 * @param {IFileData} data
 * @param {string} deletePath
 */
function deleteHardcodedRequires(data: IFileData, deletePath: string) {
  if (data[deletePath]) {
    Object.keys(data).forEach((p) => {
      const requires = data[p].requires;
      if (requires) {
        data[p].requires = requires.filter(
          (x) => path.join(path.dirname(p), x) !== deletePath,
        );
      }
    });
    delete data[deletePath];
  }
}

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

  // // Hardcoded deletion of some modules that are not used but added by accident
  // deleteHardcodedRequires(
  //   contents,
  //   "/node_modules/react/cjs/react.production.min.js",
  // );
  // deleteHardcodedRequires(
  //   contents,
  //   "/node_modules/react-dom/cjs/react-dom.production.min.js",
  // );

  return { ...contents, ...packageJSONFiles };
}

let packaging = false;

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
  const packagePath = path.join("/tmp", hash);

  // Cleanup!
  if (!packaging) {
    console.log("Cleaning up /tmp");
    try {
      const folders = fs.readdirSync("/tmp");

      folders.forEach((f) => {
        const p = path.join("/tmp/", f);
        try {
          if (fs.statSync(p).isDirectory() && p !== "/tmp/git") {
            rimraf.sync(p);
          }
        } catch (e) {
          console.error("Could not delete " + p + ", " + e.message);
        }
      });
    } catch (e) {
      console.error("Could not delete dependencies: " + e.message);
      console.log("Continuing packaging...");
    }
  }

  packaging = true;
  try {
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

    const requireStatements = new Set<string>();
    Object.keys(contents).forEach((p) => {
      const c = contents[p];

      if (c.requires) {
        c.requires.forEach((r) => requireStatements.add(r));
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
          Body: zlib.gzipSync(JSON.stringify(response)),
          Bucket: BUCKET_NAME,
          Key: `v${VERSION}/packages/${dependency.name}/${dependency.version}.json`,
          ACL: "public-read",
          ContentType: "application/json",
          CacheControl: "public, max-age=31536000",
          ContentEncoding: "gzip",
        },
        (err) => {
          if (err) {
            console.log(err);
            throw err;
          }
        },
      );
    }

    // Cleanup
    try {
      rimraf.sync(packagePath);
    } catch (e) {
      /* ignore */
    }

    cb(undefined, response);
  } catch (e) {
    // Cleanup
    try {
      rimraf.sync(packagePath);
    } catch (e) {
      /* ignore */
    }

    console.error("ERROR", e);

    Raven.captureException(e, {
      tags: {
        hash,
        dependency: `${dependency.name}@${dependency.version}`,
      },
    });
    cb(undefined, { error: e.message });
  } finally {
    packaging = false;
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

      // const size = {};

      // console.log(result.contents);

      // Object.keys(result.contents).forEach(p => {
      //   size[p] =
      //     result.contents[p].content && result.contents[p].content.length;
      // });

      res.json(result);
    });
  });

  app.listen(4545, () => {
    /*es*/
  });
}
