import * as acorn from "acorn";
import { CallExpression, ImportDeclaration, Literal } from "estree";
import * as Babel from "babel-core";
import { babylonAstDependencies } from "./get-deps";

require("acorn-dynamic-import/lib/inject").default(acorn);
/* tslint:enable */

const ECMA_VERSION = 2017;

type NewCallExpression = CallExpression & {
  callee: {
    type: "Import";
    name: string;
  };
} & {
  callee: {
    type: "MemberExpression";
    object: {
      type: string;
      name: string;
    };
    property: {
      type: string;
      name: string;
    };
  };
};

export default function exportRequires(code: string) {
  const plugins: any = [
    "transform-node-env-inline",
    "minify-dead-code-elimination",
  ];
  const presets = ["stage-0"];

  process.env.NODE_ENV = "development";
  let { ast } = Babel.transform(code, {
    plugins,
    presets,
  });
  process.env.NODE_ENV = "production";

  const requires: string[] = [];

  const deps = babylonAstDependencies(ast);

  deps.forEach((dep: any) => requires.push(dep.source));

  return requires;
}
