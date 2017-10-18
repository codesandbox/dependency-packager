import { ILambdaResponse } from "../";
import findConflicts from "./find-conflicts";

describe("find-conflicts", () => {
  function buildDependencies(
    name: string,
    version: string,
    dependencies: {
      [name: string]: {
        semver: string;
        resolved: string;
        parents: string[];
        entries: string[];
      };
    },
  ): ILambdaResponse {
    return {
      aliases: {},
      contents: {},
      dependency: {
        name,
        version,
      },
      peerDependencies: {},
      dependencyDependencies: dependencies,
    };
  }

  it("combines non-conflicting dependencies", () => {
    const dependencies = [
      buildDependencies("test1", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.0.0",
          parents: ["test1"],
          entries: [],
        },
        react: {
          semver: "^2.0.0",
          resolved: "2.0.0",
          parents: ["test1"],
          entries: [],
        },
      }),
      buildDependencies("test2", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.0.0",
          parents: ["test2"],
          entries: [],
        },
      }),
    ];

    expect(findConflicts(dependencies)).toMatchSnapshot();
  });

  it("creates separate entries for conflicting versions with different entrypoints", () => {
    const dependencies = [
      buildDependencies("test1", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.0.0",
          parents: ["test1"],
          entries: ["a"],
        },
        react: {
          semver: "^2.0.0",
          resolved: "2.0.0",
          parents: ["test1"],
          entries: [],
        },
      }),
      buildDependencies("test2", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.3.5",
          parents: ["test2"],
          entries: ["b"],
        },
      }),
    ];

    expect(findConflicts(dependencies)).toMatchSnapshot();
  });

  it("doesn't create separate entries for semver matching when the entry points match", () => {
    const dependencies = [
      buildDependencies("test1", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.0.0",
          parents: ["test1"],
          entries: ["a"],
        },
        react: {
          semver: "^2.0.0",
          resolved: "2.0.0",
          parents: ["test1"],
          entries: [],
        },
      }),
      buildDependencies("test2", "0.0.0", {
        "react-dom": {
          semver: "^1.0.0",
          resolved: "1.3.5",
          parents: ["test2"],
          entries: ["a"],
        },
      }),
    ];

    expect(findConflicts(dependencies)).toMatchSnapshot();
  });
});
