import { Callback, Context } from "aws-lambda";
import * as aws from "aws-sdk";
import * as path from "path";

import { VERSION } from "../config";

import getHash from "./utils/get-hash";

import parseDependencies from "./dependencies/parse-dependencies";
import mergeResults from "./merge-results";

export interface ILambdaResponse {
  contents: {
    [path: string]: string;
  };
  dependency: {
    name: string;
    version: string;
  };
  peerDependencies: {
    [dep: string]: string;
  };
  dependencyDependencies: {
    [dep: string]: {
      semver: string;
      resolved: string;
      parents: string[];
      entries: string[];
    };
  };
  dependencyAliases: {
    [dep: string]: {
      [dep: string]: string;
    };
  };
}

const CACHE_TIME = 60 * 60 * 24; // A day caching

const lambda = new aws.Lambda({
  region: "eu-west-1",
});

const s3 = new aws.S3();
const { BUCKET_NAME } = process.env;

function getFileFromS3(
  keyPath: string,
): Promise<aws.S3.GetObjectOutput | null> {
  return new Promise((resolve, reject) => {
    if (!BUCKET_NAME) {
      reject("No BUCKET_NAME provided");
      return;
    }

    s3.getObject(
      {
        Bucket: BUCKET_NAME,
        Key: keyPath,
      },
      (err, packageData) => {
        if (err && err.name !== "AccessDenied") {
          console.error(err);
          reject(err);
          return;
        }

        resolve(packageData);
      },
    );
  });
}

function saveFileToS3(
  keyPath: string,
  content: string,
  contentType: string = "application/json",
): Promise<aws.S3.PutObjectOutput> {
  return new Promise((resolve, reject) => {
    if (!BUCKET_NAME) {
      reject("No BUCKET_NAME provided");
      return;
    }

    s3.putObject(
      {
        Bucket: BUCKET_NAME,
        Key: keyPath, // don't allow slashes
        Body: content,
        ContentType: contentType,
      },
      (err, response) => {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }

        resolve(response);
      },
    );
  });
}

function getS3BundlePath(dependencies: IDependencies) {
  return (
    `v${VERSION}/combinations/` +
    Object.keys(dependencies)
      .filter(d => d !== "node-libs-browser")
      .sort()
      .map(
        // Paths starting with slashes don't work with cloudfront, even escaped. So we remove the slashes
        dep =>
          `${encodeURIComponent(
            dep.replace("/", "-").replace("@", ""),
          )}@${dependencies[dep]}`,
      )
      .join("+") +
    ".json"
  );
}

function generateDependency(
  name: string,
  version: string,
): Promise<ILambdaResponse> {
  return new Promise((resolve, reject) => {
    lambda.invoke(
      {
        FunctionName: `codesandbox-packager-${process.env
          .SERVERLESS_STAGE}-packager`,
        Payload: JSON.stringify({
          name,
          version,
        }),
      },
      (error, data) => {
        if (error) {
          error.message = `Error while packaging ${name}@${version}: ${error.message}`;

          reject(error);
          return;
        }

        if (typeof data.Payload === "string") {
          resolve(JSON.parse(data.Payload));
        }
      },
    );
  });
}

function getResponse(bundlePath: string) {
  const response = JSON.stringify({ url: bundlePath.replace(/\+/g, "%2B") });

  return {
    statusCode: 200,
    headers: {
      "Cache-Control": `public, max-age=${CACHE_TIME}`,
      "Content-Type": "application/json",
      "Content-Length": response.length,
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials": true, // Required for cookies, authorization headers with HTTPS
    },
    body: response,
  };
}

export async function http(event: any, context: Context, cb: Callback) {
  try {
    /** Immediate response for WarmUP plugin */
    if (event.source === "serverless-plugin-warmup") {
      console.log("WarmUP - Lambda is warm!");
      return cb(undefined, "Lambda is warm!");
    }

    const { packages } = event.pathParameters;
    const escapedPackages = decodeURIComponent(packages);
    const dependencies = await parseDependencies(escapedPackages);

    const receivedData: ILambdaResponse[] = [];

    if (!BUCKET_NAME) {
      throw new Error("No BUCKET_NAME provided");
    }

    // Add node-libs-browser
    dependencies["node-libs-browser"] = "2.0.0";

    const bundlePath = getS3BundlePath(dependencies);
    const bundle = await getFileFromS3(bundlePath);

    const response = JSON.stringify({ url: bundlePath });

    if (bundle && bundle.Body) {
      cb(undefined, getResponse(bundlePath));
      return;
    }

    Object.keys(dependencies).forEach(async depName => {
      const depPath = `v${VERSION}/packages/${depName}/${dependencies[
        depName
      ]}.json`;
      const s3Object = await getFileFromS3(depPath);

      if (s3Object && s3Object.Body != null) {
        const result = JSON.parse(s3Object.Body.toString()) as ILambdaResponse;

        receivedData.push(result);
      } else {
        const data = await generateDependency(depName, dependencies[depName]);

        if (!data.dependency) {
          return cb(
            new Error(
              "Something went wrong wile packaging the dependency " + depName,
            ),
          );
        }

        receivedData.push(data);
      }

      if (receivedData.length === Object.keys(dependencies).length) {
        const body = JSON.stringify(mergeResults(receivedData));

        await saveFileToS3(bundlePath, body);
        cb(undefined, getResponse(bundlePath));
      }
    });
  } catch (e) {
    console.error("ERROR ", e);
    cb(e);
  }
}
