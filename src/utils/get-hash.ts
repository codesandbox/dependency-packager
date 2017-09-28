const hash = require('string-hash');

export default function(packages: IDependencies) {
  if (!packages || Object.keys(packages).length === 0) {
    return null;
  }

  var packagesList = Object.keys(packages)
    .map(function(key) {
      return key + ':' + packages[key];
    })
    .sort(function(a, b) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
  return String(hash(JSON.stringify(packagesList)));
}
