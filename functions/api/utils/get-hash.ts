const hash = require("string-hash");

export default function(packages: IDependencies) {
  if (!packages || Object.keys(packages).length === 0) {
    return null;
  }

  const packagesList = Object.keys(packages)
    .map(key => {
      return key + ":" + packages[key];
    })
    .sort((a, b) => {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    });
  return String(hash(JSON.stringify(packagesList)));
}
