// @ts-ignore
import * as walk from "acorn-walk";
import * as meriyah from "meriyah";

export default function exportRequires(code: string) {
  let ast: meriyah.ESTree.Program;
  let isModule = false;

  try {
    ast = meriyah.parseScript(code);
  } catch (e) {
    isModule = true;
    ast = meriyah.parseModule(code);
  }

  const requires: string[] = [];

  // @ts-ignore
  walk.simple(ast, {
    ImportDeclaration(node: meriyah.ESTree.ImportDeclaration) {
      isModule = true;
      // Seems like the typings are wrong in the library
      const source = node.source as meriyah.ESTree.Literal;
      if (source && typeof source.value === "string") {
        requires.push(source.value);
      }
    },
    ImportExpression(node: meriyah.ESTree.ImportExpression) {
      isModule = true;
      // Seems like the typings are wrong in the library
      const source = node.source as meriyah.ESTree.Literal;
      if (source && typeof source.value === "string") {
        requires.push(source.value);
      }
    },
    ExportNamedDeclaration(node: meriyah.ESTree.ExportNamedDeclaration) {
      isModule = true;
      const source = node.source;
      if (source && typeof source.value === "string") {
        requires.push(source.value);
      }
    },
    ExportAllDeclaration(node: meriyah.ESTree.ExportAllDeclaration) {
      isModule = true;
      const source = node.source;
      if (source && typeof source.value === "string") {
        requires.push(source.value);
      }
    },
    CallExpression(node: meriyah.ESTree.CallExpression) {
      if (
        /* require() */ (node.callee.type === "Identifier" &&
          node.callee.name === "require") ||
        node.callee.type === "Import" ||
        /* require.resolve */ (node.callee.type === "MemberExpression" &&
          node.callee.object.name &&
          node.callee.object.name === "require" &&
          node.callee.property.name &&
          node.callee.property.name === "resolve")
      ) {
        if (node.arguments.length === 1) {
          if (node.arguments[0].type === "Literal") {
            const { value } = node.arguments[0];

            if (typeof value === "string") {
              requires.push(value);
            }
          } else if (node.arguments[0].type === "TemplateLiteral") {
            const { quasis } = node.arguments[0];
            if (quasis.length === 1) {
              requires.push(quasis[0].value.raw);
            }
          }
        }
      }
    },
  });

  return { requires, isModule };
}
