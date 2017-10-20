import { ILambdaResponse } from "./";
import mergeResults from "./merge-results";

describe("mergeResults", () => {
  const react: ILambdaResponse = {
    aliases: {
      react: "react/lib/react.development.js",
      fbjs: "fbjs/lib/index.js",
    },
    contents: {
      "react/lib/react.development.js": "yes",
      "fbjs/lib/index.js": "yes yes",
    },
    dependency: {
      name: "react",
      version: "16.0.0",
    },
    dependencyDependencies: {
      fbjs: {
        entries: ["fbjs"],
        parents: ["react"],
        resolved: "12.0.0",
        semver: "^12.0.0",
      },
    },
    peerDependencies: {},
  };
  const reactDom: ILambdaResponse = {
    aliases: {
      "react-dom": "react-dom/lib/react-dom.development.js",
      fbjs: "fbjs/lib/index.js",
    },
    contents: {
      "react-dom/lib/react-dom.development.js": "yes yes",
      "fbjs/lib/index.js": "yes yes",
    },
    dependency: {
      name: "react-dom",
      version: "16.0.0",
    },
    dependencyDependencies: {
      fbjs: {
        entries: ["fbjs"],
        parents: ["react-dom"],
        resolved: "12.0.0",
        semver: "^12.0.0",
      },
    },
    peerDependencies: {},
  };
  it("can merge 2 responses", () => {
    const merge = mergeResults([react, reactDom]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with absolute conflicts", () => {
    const conflict: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes",
      },
      dependency: {
        name: "conflict",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs"],
          parents: ["conflict"],
          resolved: "12.0.1",
          semver: "^12.0.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with absolute+semver conflicts, but same entries", () => {
    const conflict: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes",
      },
      dependency: {
        name: "conflict",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs"],
          parents: ["conflict"],
          resolved: "12.0.1",
          semver: "^12.2.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with full semver conflicts", () => {
    const conflict: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes 11",
      },
      dependency: {
        name: "conflict",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs"],
          parents: ["conflict"],
          resolved: "11.0.1",
          semver: "^11.2.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with semver/absolute conflicts, but different entries", () => {
    const conflict: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict"],
          resolved: "12.0.1",
          semver: "^12.2.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with conflicts recursively", () => {
    const conflict1: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict1",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict1"],
          resolved: "12.0.1",
          semver: "^12.2.0",
        },
      },
      peerDependencies: {},
    };

    const conflict2: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes 11.0.2",
      },
      dependency: {
        name: "conflict2",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict2"],
          resolved: "11.0.2",
          semver: "^11.2.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict1, conflict2]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with multiple conflicts", () => {
    const conflict1: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict1",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict1"],
          resolved: "12.0.1",
          semver: "^12.2.0",
        },
      },
      peerDependencies: {},
    };

    const conflict2: ILambdaResponse = {
      aliases: {
        react: "react/lib/react.development.js",
        fbjs: "fbjs/lib/index.js",
      },
      contents: {
        "react/lib/react.development.js": "yes",
        "fbjs/lib/index.js": "yes yes",
      },
      dependency: {
        name: "conflict2",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict2"],
          resolved: "12.0.1",
          semver: "^12.2.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict1, conflict2]);

    expect(merge).toMatchSnapshot();
  });
});
