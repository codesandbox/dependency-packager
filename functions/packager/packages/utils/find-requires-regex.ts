const lineRegex = /require\(['|"|`]([^"|'|`]*)['|"|`]\)|require\((.*)\)/g;
const partRegex = /require\(['|"|`]([^"|'|`]*)['|"|`]\)|require\((.*)\)/;

export function isValidForRegex(code: string) {
  return !/^(import|export)\s|import\(/gm.test(code);
}

/**
 * This is the regex version of getting all require statements, it makes the assumption
 * that the file is commonjs and only has `require()` statements.
 */
export function getRequireStatements(code: string) {
  const results: string[] = [];
  code.split("\n").forEach(line => {
    const matches = line.match(lineRegex);
    if (matches) {
      matches.forEach(codePart => {
        const match = codePart.match(partRegex);

        if (match) {
          if (match[1]) {
            if (!results.find(r => r === match[1])) {
              results.push(match[1]);
            }
          } else if (match[2]) {
            if (!results.find(r => r === match[2])) {
              results.push(match[2]);
            }
          }
        }
      });
    }
  });

  return results;
}
