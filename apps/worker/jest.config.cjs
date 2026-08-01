/** @type {import("jest").Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/../tsconfig.spec.json",
    },
  },
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // @hushd/shared ships ESM-only exports; point Jest at the built CJS-compatible output
    "^@hushd/shared$": "<rootDir>/../../../packages/shared/dist/index.js",
  },
};
