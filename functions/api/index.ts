import { Callback, Context } from "aws-lambda";
import * as aws from "aws-sdk";
import * as path from "path";

import getHash from "./utils/get-hash";

import parseDependencies from "./dependencies/parse-dependencies";

interface ILambdaResponse {
  aliases: {
    [path: string]: string | false;
  };
  contents: {
    [path: string]: string;
  };
  dependency: {
    name: string;
    version: string;
  };
  dependencyDependencies: {
    [dep: string]: string;
  };
}

const CACHE_TIME = 60 * 60 * 24; // A day caching

const lambda = new aws.Lambda({
  region: "eu-west-1",
});

const s3 = new aws.S3();
const { BUCKET_NAME } = process.env;

function mergeResults(responses: ILambdaResponse[]) {
  return responses.reduce(
    (total, next) => ({
      aliases: { ...total.aliases, ...next.aliases },
      contents: { ...total.contents, ...next.contents },
      dependencies: [...total.dependencies, next.dependency],
      dependencyDependencies: {
        ...total.dependencyDependencies,
        ...next.dependencyDependencies,
      },
    }),
    { aliases: {}, contents: {}, dependencies: [], dependencyDependencies: {} },
  );
}

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
        Key: keyPath,
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
  return encodeURIComponent(
    "combinations/" +
      Object.keys(dependencies)
        .sort()
        .map(dep => `${dep}@${dependencies[dep]}`)
        .join("+") +
      ".json",
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
  const response = JSON.stringify({ url: bundlePath });

  return {
    statusCode: 200,
    headers: {
      "Cache-Control": `public, max-age=${CACHE_TIME}`,
      "Content-Type": "application/json",
      "Content-Length": response.length,
    },
    body: response,
  };
}

export async function http(event: any, context: Context, cb: Callback) {
  const { packages } = event.pathParameters;
  const escapedPackages = decodeURIComponent(packages);
  const dependencies = await parseDependencies(escapedPackages);

  const receivedData: ILambdaResponse[] = [];

  if (!BUCKET_NAME) {
    throw new Error("No BUCKET_NAME provided");
  }

  // TODO test if this is really needed
  // // Add node-libs-browser
  // dependencies["node-libs-browser"] = "latest";

  const bundlePath = getS3BundlePath(dependencies);
  const bundle = await getFileFromS3(bundlePath);

  const response = JSON.stringify({ url: bundlePath });

  if (bundle && bundle.Body) {
    cb(undefined, getResponse(bundlePath));
    return;
  }

  Object.keys(dependencies).forEach(async depName => {
    const depPath = `packages/${depName}/${dependencies[depName]}.json`;
    const s3Object = await getFileFromS3(depPath);

    if (s3Object && s3Object.Body != null) {
      receivedData.push(JSON.parse(s3Object.Body.toString()));
    } else {
      const data = await generateDependency(depName, dependencies[depName]);

      receivedData.push(data);
    }

    const body = JSON.stringify(mergeResults(receivedData));

    if (receivedData.length === Object.keys(dependencies).length) {
      await saveFileToS3(bundlePath, body);
      cb(undefined, getResponse(bundlePath));
    }
  });
}
