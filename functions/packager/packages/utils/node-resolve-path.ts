import * as fs from "fs";
import { join } from "path";

function exists(path: string) {
  if (fs.existsSync(path)) {
    return path;
  }
}

/**
 * This will use node's way of resolving a javascript file. For example,
 * if the path is `dist`, but the file is `dist/index.js` this will return
 * `dist/index.js`.
 *
 * @export string if path exists
 * @param {string} path
 */
export default function readFile(path: string) {
  if (exists(path) && fs.lstatSync(path).isDirectory()) {
    return exists(join(path, "index.js"));
  } else {
    return exists(path) || exists(path + ".js") || exists(path + ".json");
  }
}
