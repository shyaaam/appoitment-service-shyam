module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'], // Look for tests in src and a dedicated tests folder
    testMatch: [ // Patterns to find test files
      '**/__tests__/**/*.+(ts|tsx|js)',
      '**/?(*.)+(spec|test).+(ts|tsx|js)',
    ],
    transform: {
      '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    moduleNameMapper: { // If using absolute paths in imports based on tsconfig baseUrl
      '^@src/(.*)$': '<rootDir>/src/$1',
      '^@tests/(.*)$': '<rootDir>/tests/$1',
    },
    // setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'], // Optional: Run setup after env is ready (e.g., global mocks)
    clearMocks: true, // Automatically clear mock calls and instances between every test
    collectCoverage: true, // Enable coverage collection
    coverageDirectory: "coverage", // Output directory for coverage reports
    coverageProvider: "v8", // Use V8's built-in coverage
     // Optional: Increase timeout for integration tests if needed
    // testTimeout: 30000,
  };