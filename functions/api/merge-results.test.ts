import * as fs from "fs";
import { ILambdaResponse } from "./";
import mergeResults from "./merge-results";

const readFixture = (path: string) => {
  const json = JSON.parse(
    fs.readFileSync(__dirname + "/fixtures/" + path).toString(),
  );

  // we remove contents to remove clutter

  Object.keys(json.contents).forEach(p => {
    json.contents[p].content = "";
  });

  return json;
};

const downloadFixture = (dep: string, version: string) =>
  require("node-fetch")
    .default(
      `https://s3-eu-west-1.amazonaws.com/prod.packager.packages/v1/packages/${dep}/${version}.json`,
    )
    .then(x => x.json())
    .then(json => {
      const r = json;
      return r;
    });

describe("mergeResults", () => {
  const react: ILambdaResponse = {
    contents: {
      "/node_modules/react/lib/react.development.js": "yes",
      "/node_modules/fbjs/lib/index.js": "yes yes",
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
    contents: {
      "/node_modules/react-dom/lib/react-dom.development.js": "yes yes",
      "/node_modules/fbjs/lib/index.js": "yes yes",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes",
      },
      dependency: {
        name: "conflict",
        version: "16.0.0",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs"],
          parents: ["conflict"],
          resolved: "13.0.1",
          semver: "^13.0.0",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([react, reactDom, conflict]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge responses with absolute+semver conflicts, but same entries", () => {
    const conflict: ILambdaResponse = {
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes 11",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes 11.0.2",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
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
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes",
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

  it("can merge responses with range semvers", () => {
    const conflict1: ILambdaResponse = {
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict1",
        version: "3.0.1",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict1"],
          resolved: "3.2.5",
          semver: "1.2.6 - 3",
        },
      },
      peerDependencies: {},
    };

    const conflict2: ILambdaResponse = {
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict2",
        version: "3.0.2",
      },
      dependencyDependencies: {
        fbjs: {
          entries: ["fbjs", "fbjs/lib/test.js"],
          parents: ["conflict2"],
          resolved: "3.2.6",
          semver: "1.2.6 - 3",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([conflict1, conflict2]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge atlaskit", () => {
    const themeDep = readFixture("atlaskit-theme-3.2.0.json");
    const logoDep = readFixture("atlaskit-logo-7.0.0.json");
    const scDep = readFixture("styled-components-3.2.6.json");

    const merge = mergeResults([themeDep, logoDep, scDep]);

    expect(merge.dependencyAliases).toEqual({});
  });

  it("can merge main dependency with depdeps", () => {
    const conflict1: ILambdaResponse = {
      contents: {
        "/node_modules/conflict1/lib/doep.js": "yes",
        "/node_modules/conflict1/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict1",
        version: "3.2.5",
      },
      dependencyDependencies: {},
      peerDependencies: {},
    };

    const conflict2: ILambdaResponse = {
      contents: {
        "/node_modules/react/lib/react.development.js": "yes",
        "/node_modules/fbjs/lib/index.js": "yes yes c",
      },
      dependency: {
        name: "conflict2",
        version: "3.0.2",
      },
      dependencyDependencies: {
        conflict1: {
          entries: ["conflict1"],
          parents: ["conflict2"],
          resolved: "3.2.5",
          semver: "1.2.6 - 3",
        },
      },
      peerDependencies: {},
    };

    const conflict3: ILambdaResponse = {
      contents: {
        "/node_modules/conflict1/lib/dap.js": "yes",
        "/node_modules/conflict1/lib/index.js": "yes yes d",
      },
      dependency: {
        name: "conflict3",
        version: "3.0.2",
      },
      dependencyDependencies: {
        conflict1: {
          entries: ["conflict1"],
          parents: ["conflict3"],
          resolved: "1.2.6",
          semver: "~1.2.6",
        },
      },
      peerDependencies: {},
    };

    const merge = mergeResults([conflict1, conflict2, conflict3]);

    expect(merge).toMatchSnapshot();
  });

  it("can merge web3", async () => {
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const web3 = await downloadFixture("web3", "0.20.6");
    const web3ProviderEngine = await downloadFixture(
      "web3-provider-engine",
      "14.0.5",
    );

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    web3.contents = {
      "/node_modules/web3/package.json": {
        contents: "{}",
      },
    };

    web3ProviderEngine.contents = {
      "/node_modules/web3-provider-engine/package.json": {
        contents: `{ "title": "test" }`,
      },
    };

    const merge = mergeResults([web3, web3ProviderEngine]);

    expect(merge).toMatchSnapshot();
  });

  it("uses the old content if the new response uses an older semver", async () => {
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const material = await downloadFixture("@material-ui/core", "3.9.2");
    const styledComponents = await downloadFixture(
      "styled-components",
      "4.1.3",
    );

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    const merge = mergeResults([material, styledComponents]);

    expect(
      JSON.parse(merge.contents["/node_modules/react-is/package.json"].content)
        .version,
    ).toBe("16.7.0");
  });

  it("doesn't duplicate dependency without reason", async () => {
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const reactRouter = await downloadFixture("react-router", "4.4.0-beta.6");
    const reactRouterDom = await downloadFixture(
      "react-router-dom",
      "4.4.0-beta.6",
    );

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    const merge = mergeResults([reactRouter, reactRouterDom]);
    merge.contents = {};

    expect(merge.dependencyAliases).toEqual({});
    expect(merge).toMatchSnapshot();
  });

  it("can replace contents and add new transient dependencies", async () => {
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const deps = [
      await downloadFixture("aurelia-framework", "1.3.0"),
      await downloadFixture("aurelia-logging-console", "1.0.0"),
    ];

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    const merge = mergeResults(deps);

    expect(
      merge.contents[
        "/node_modules/aurelia-logging-console/dist/commonjs/aurelia-logging-console.js"
      ],
    ).not.toBeFalsy();
  });

  it("takes priority on original dependencies over transient dependency versions", async () => {
    // https://github.com/codesandbox/codesandbox-client/issues/1355
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const deps = [
      await downloadFixture("react-pose", "4.0.3"),
      await downloadFixture("pose-core", "2.0.2"),
    ];

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    const merge = mergeResults(deps);

    expect(
      merge.contents["/node_modules/pose-core/package.json"],
    ).not.toBeFalsy();

    expect(
      JSON.parse(merge.contents["/node_modules/pose-core/package.json"].content)
        .version,
    ).toBe("2.0.2");
  });

  it.only("can resolve an absolute transient dependency and a semver", async () => {
    // https://github.com/CompuIves/codesandbox-client/issues/1355
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    const deps = [
      await downloadFixture("0x.js", "6.0.9"),
      await downloadFixture("ethers", "4.0.28"),
    ];

    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    const merge = mergeResults(deps);
    expect(merge.dependencyAliases.uuid).not.toBeFalsy();

    expect(merge.contents["/node_modules/uuid/package.json"]).not.toBeFalsy();

    expect(
      JSON.parse(merge.contents["/node_modules/uuid/package.json"].content)
        .version,
    ).toBe("2.0.1");
  });
});
