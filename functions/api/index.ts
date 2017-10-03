import { Callback, Context } from "aws-lambda";
import * as aws from "aws-sdk";
import * as path from "path";

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
}

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
    }),
    { aliases: {}, contents: {}, dependencies: [] },
  );
}

function getDependencyFromS3(
  name: string,
  version: string,
): Promise<aws.S3.GetObjectOutput | null> {
  return new Promise((resolve, reject) => {
    if (!BUCKET_NAME) {
      reject("No BUCKET_NAME provided");
      return;
    }

    s3.getObject(
      {
        Bucket: BUCKET_NAME,
        Key: `packages/${name}/${version}.json`,
      },
      (err, packageData) => {
        if (err) {
          console.error(err);
        }

        resolve(packageData);
      },
    );
  });
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

export async function http(event: any, context: Context, cb: Callback) {
  const { packages } = event.pathParameters;
  const escapedPackages = decodeURIComponent(packages);
  const dependencies = await parseDependencies(escapedPackages);

  const receivedData: ILambdaResponse[] = [];

  if (!BUCKET_NAME) {
    throw new Error("No BUCKET_NAME provided");
  }

  Object.keys(dependencies).forEach(async depName => {
    const s3Object = await getDependencyFromS3(depName, dependencies[depName]);

    if (s3Object && s3Object.Body != null) {
      receivedData.push(JSON.parse(s3Object.Body.toString()));
    } else {
      const data = await generateDependency(depName, dependencies[depName]);

      receivedData.push(data);
    }

    if (receivedData.length === Object.keys(dependencies).length) {
      cb(undefined, {
        statusCode: 200,
        body: JSON.stringify(mergeResults(receivedData)),
      });
    }
  });
}
