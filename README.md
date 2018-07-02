# Sandpack Packager

> A packager used to aggregate all relevant files from a combination of npm dependencies

## Installing

This service is based on the services of Amazon. We use AWS Lambda, S3 and API Gateway to handle all requests. We provision these services using [serverless](https://serverless.com/).

Installation should be as simple as setting up serverless ([Getting Started](https://serverless.com/framework/docs/getting-started/)) and running `sls deploy --stage dev --s3prefix myBucketName`. `stage` can be either `prod` or `dev`, `s3prefix` is the prefix for your S3 bucket name.
