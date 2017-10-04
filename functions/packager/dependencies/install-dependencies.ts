import { exec } from "child_process";
import { join } from "path";

export default function(
  dependency: { name: string; version: string },
  packagePath: string,
) {
  return new Promise((resolve, reject) => {
    exec(
      `mkdir -p ${packagePath} && cd ${packagePath} && HOME=/tmp node ${join(
        __dirname,
        "../../../node_modules",
        "yarn",
        "lib",
        "cli",
      )} add ${dependency.name}@${dependency.version} --no-lockfile --ignore-scripts --non-interactive --no-bin-links --no-lockfile --ignore-engines`,
      (err, stdout, stderr) => {
        if (err) {
          reject(
            err.message.indexOf("versions") >= 0
              ? new Error("INVALID_VERSION")
              : err,
          );
        } else {
          resolve();
        }
      },
    );
  });
}
