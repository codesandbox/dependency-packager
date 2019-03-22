import extractRequires from "./extract-requires";

describe("extractRequires", () => {
  it("can find simple requires", () => {
    const code = `
      import React from 'react';
    `;

    expect(extractRequires(code).requires).toEqual(["react"]);
  });

  it("can find require statements", () => {
    const code = `
      const react = require('react');
    `;

    expect(extractRequires(code).requires).toEqual(["react"]);
  });

  it("can find dynamic require statements", () => {
    const code = `
    const react = import('react');
  `;

    expect(extractRequires(code).requires).toEqual(["react"]);
  });

  it("returns should-transpile for dynamic dependencies", () => {
    const code = `
    const react = require('./' + a);
    const bah = require('./aaa/' + a + '.js');
  `;

    expect(extractRequires(code).requires).toEqual(["glob:./", "glob:./aaa/"]);
  });

  it("can find multiple statements", () => {
    const code = `
      import angular from 'angular';
      import test from './test';
      const react = import('react');

      function run() {
        const a = require('./test2');
      }
    `;

    expect(extractRequires(code).requires).toEqual([
      "angular",
      "./test",
      "react",
      "./test2",
    ]);
  });

  it("can find import promises", () => {
    const code = `
      const reactDom = import('react-dom').then(dom => dom.render('a'));
    `;

    expect(extractRequires(code).requires).toEqual(["react-dom"]);
  });
});
