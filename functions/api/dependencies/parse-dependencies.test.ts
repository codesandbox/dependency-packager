import parseDependencies from "./parse-dependencies";

describe("parse-dependencies", () => {
  it("can parse normal dependencies", async () => {
    const res = await parseDependencies("react@16.0.0");

    expect(res).toEqual({ react: "16.0.0" });
  });

  it("can parse dependencies with organization", async () => {
    const res = await parseDependencies("@cerebral/react@2.2.0");

    expect(res).toEqual({ "@cerebral/react": "2.2.0" });
  });
});
