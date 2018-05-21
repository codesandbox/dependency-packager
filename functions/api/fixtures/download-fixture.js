const [_n, _f, dep, version] = process.argv;
require("node-fetch")
  .default(
    `https://s3-eu-west-1.amazonaws.com/prod.packager.packages/v1/packages/${dep}/${version}.json`,
  )
  .then(x => x.json())
  .then(json => {
    const r = json;
    r.contents = {};
    require("fs").writeFileSync(`./${dep}-${version}.json`, JSON.stringify(r));
  });
