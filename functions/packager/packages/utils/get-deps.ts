import traverse from "babel-traverse";
import * as types from "babel-types";

export function babylonAstDependencies(ast: any) {
  const dependencies: any[] = [];

  function addDependency(source: any) {
    // Ensure that dependencies are only identified once
    if (!dependencies.some(dep => dep.source === source)) {
      dependencies.push({ source });
    }
  }

  traverse(ast, {
    // `import ... from '...';
    ImportDeclaration(node: any) {
      addDependency(node.node.source.value);
    },
    // `export ... from '...';
    ExportDeclaration(node: any) {
      if (node.node.source) {
        addDependency(node.node.source.value);
      }
    },
    // `require('...');
    CallExpression(node: any) {
      const callNode = node.node;
      if (
        callNode.callee.name === "require" ||
        callNode.callee.type === "Import"
      ) {
        const arg = callNode.arguments[0];
        if (types.isLiteral(arg)) {
          const anyArg: any = arg;
          addDependency(anyArg.value);
        } else {
          if (!arg.loc || !arg.loc.start) {
            throw new Error("Require expression cannot be statically analyzed");
          }

          const err: any = new Error(
            `Require expression at line ${arg.loc.start.line}, column ${
              arg.loc.start.column
            } cannot be statically analyzed`,
          );

          err.loc = {
            line: arg.loc.start.line,
            column: arg.loc.start.column,
          };

          throw err;
        }
      }
    },
  });

  return dependencies;
}
