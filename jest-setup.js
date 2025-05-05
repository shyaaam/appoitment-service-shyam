// This file sets up jest to work with TypeScript path aliases

const tsConfigPaths = require('tsconfig-paths');
const { compilerOptions } = require('./tsconfig.test.json');

// Register paths from tsconfig
tsConfigPaths.register({
  baseUrl: compilerOptions.baseUrl,
  paths: compilerOptions.paths,
});