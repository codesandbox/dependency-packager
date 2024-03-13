# Sandpack Packager
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fcodesandbox%2Fdependency-packager.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fcodesandbox%2Fdependency-packager?ref=badge_shield)


> A packager used to aggregate all relevant files from a combination of npm dependencies

## Installing

This service is based on the services of Amazon. We use AWS Lambda, S3 and API Gateway to handle all requests. We provision these services using [serverless](https://serverless.com/).

Installation should be as simple as setting up serverless ([Getting Started](https://serverless.com/framework/docs/getting-started/)) and running `sls deploy --stage dev --s3prefix myBucketName`. `stage` can be either `prod` or `dev`, `s3prefix` is the prefix for your S3 bucket name.


## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fcodesandbox%2Fdependency-packager.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fcodesandbox%2Fdependency-packager?ref=badge_large)