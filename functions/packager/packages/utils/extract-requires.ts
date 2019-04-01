import * as babel from "@babel/core";
import traverse, { NodePath } from "@babel/traverse";
import {
  BinaryExpression,
  Identifier,
  MemberExpression,
  StringLiteral,
} from "@babel/types";
import { uniq } from "lodash";

function nodeEnvReplacerPlugin({ types: t }: { types: any }) {
  return {
    name: "transform-node-env-inline",
    visitor: {
      MemberExpression(path: NodePath<MemberExpression>) {
        if (path.matchesPattern("process.env.NODE_ENV")) {
          path.replaceWith(t.valueToNode("development"));

          if (path.parentPath.isBinaryExpression()) {
            const evaluated = path.parentPath.evaluate();
            if (evaluated.confident) {
              path.parentPath.replaceWith(t.valueToNode(evaluated.value));
            }
          }
        }
      },
    },
  };
}

export default function exportRequires(code: string) {
  let result: babel.BabelFileResult | null;
  let forceTranspile = false;

  try {
    result = babel.transformSync(code, {
      ast: true,
      sourceType: "unambiguous",
      plugins: [
        "@babel/plugin-transform-modules-commonjs",
        nodeEnvReplacerPlugin,
        "minify-dead-code-elimination",
      ],
      parserOpts: {
        plugins: [
          "dynamicImport",
          "exportDefaultFrom",
          "exportNamespaceFrom",
          "objectRestSpread",
          "typescript",
          "classProperties",
          "classPrivateProperties",
          "classPrivateMethods",
        ],
      },
    });
  } catch (e) {
    result = null;
    forceTranspile = true;
    console.error(e);
  }

  const requires: string[] = [];
  let newCode = code;

  if (result) {
    const { ast, code: transformedCode } = result;

    if (transformedCode) {
      newCode = transformedCode;
    }

    if (ast) {
      traverse(ast, {
        ImportDeclaration(node) {
          const value = node.node.source.value;
          if (typeof value === "string") {
            requires.push(value);
          }
        },
        CallExpression(path) {
          const { node } = path;

          if (
            /* require() */ (node.callee.type === "Identifier" &&
              node.callee.name === "require") ||
            /* import() */ node.callee.type === "Import" ||
            /* require.resolve */ (node.callee.type === "MemberExpression" &&
              (node.callee.object as Identifier).name &&
              (node.callee.object as Identifier).name === "require" &&
              node.callee.property.name &&
              node.callee.property.name === "resolve")
          ) {
            if (node.arguments.length === 1) {
              if (node.arguments[0].type === "StringLiteral") {
                const literalArgument = node.arguments[0] as StringLiteral;
                if (typeof literalArgument.value === "string") {
                  requires.push(literalArgument.value);
                }
              } else if (node.arguments[0].type === "BinaryExpression") {
                // Handle require('./' + a + '.js');
                const binaryArgument = node.arguments[0] as BinaryExpression;

                if (binaryArgument.left.type === "BinaryExpression") {
                  const secondBinaryArgument = binaryArgument.left as BinaryExpression;
                  if (secondBinaryArgument.left.type === "StringLiteral") {
                    requires.push(`glob:${secondBinaryArgument.left.value}`);
                  }
                } else if (binaryArgument.left.type === "StringLiteral") {
                  const secondArgument = binaryArgument.left as StringLiteral;

                  requires.push(`glob:${secondArgument.value}`);
                }
              }
            }
          }
        },
      });
    }
  }

  return { newCode, forceTranspile, requires: uniq(requires) };
}
