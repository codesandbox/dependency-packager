import * as acorn from "acorn";
import { CallExpression, ImportDeclaration, Literal } from "estree";
/* tslint:disable */
const walk = require("acorn/dist/walk");

require("acorn-dynamic-import/lib/inject").default(acorn);
/* tslint:enable */

const ECMA_VERSION = 2017;

type NewCallExpression = CallExpression & {
  callee: {
    type: "Import";
    name: string;
  };
};

export default function exportRequires(code: string) {
  const ast = acorn.parse(code, {
    ecmaVersion: ECMA_VERSION,
    locations: true,
    plugins: {
      dynamicImport: true,
    },
    ranges: true,
    sourceType: "module",
  });

  const requires: string[] = [];

  walk.simple(
    ast,
    {
      ImportDeclaration(node: ImportDeclaration) {
        if (typeof node.source.value === "string") {
          requires.push(node.source.value);
        }
      },
      CallExpression(node: NewCallExpression) {
        if (
          (node.callee.type === "Identifier" &&
            node.callee.name === "require") ||
          node.callee.type === "Import"
        ) {
          if (
            node.arguments.length === 1 &&
            node.arguments[0].type === "Literal"
          ) {
            const literalArgument = node.arguments[0] as Literal;
            if (typeof literalArgument.value === "string") {
              requires.push(literalArgument.value);
            }
          }
        }
      },
    },
    {
      ...walk.base,
      Import(node: any, st: any, c: any) {
        // Do nothing
      },
    },
  );

  return requires;
}
