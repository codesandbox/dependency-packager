const [_n, _f, dep, version] = process.argv;
require("node-fetch")
  .default(
    `https://prod-packager-packages.codesandbox.io/v1/packages/${dep}/${version}.json`,
  )
  .then(x => x.json())
  .then(json => {
    const r = json;
    r.contents = {};
    require("fs").writeFileSync(`./${dep}-${version}.json`, JSON.stringify(r));
  });
