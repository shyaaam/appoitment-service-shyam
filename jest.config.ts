import type { Config } from 'jest'

const jestConfig: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'], // Look for tests in src and a dedicated tests folder
  testMatch: [ // Patterns to find test files
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  moduleNameMapper: { // If using absolute paths in imports based on tsconfig baseUrl
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  setupFiles: ['<rootDir>/jest-setup.js'], // Setup file for handling path aliases
  clearMocks: true, // Automatically clear mock calls and instances between every test
  collectCoverage: true, // Enable coverage collection
  coverageDirectory: "coverage", // Output directory for coverage reports
  coverageProvider: "v8", // Use V8's built-in coverage
  // Optional: Increase timeout for integration tests if needed
  // testTimeout: 30000,
};

export default jestConfig