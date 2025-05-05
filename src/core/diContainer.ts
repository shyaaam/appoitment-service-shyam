'use strict';

import { AppError } from './errors';

// Very simple Map-based Dependency Injection Container
class DIContainer {
  // Using a WeakMap could be considered if we wanted dependencies to be garbage collected
  // if the container itself was somehow eligible, but for long-lived singletons, Map is fine.
  #dependencies: Map<string, unknown> = new Map();

  register<T>(name: string, dependency: T): void {
    if (this.#dependencies.has(name)) {
      console.warn(`Dependency "${name}" is already registered. Overwriting.`);
    }
    this.#dependencies.set(name, dependency);
    console.log(`Registered dependency: ${name}`);
  }

  resolve<T>(name: string): T {
    const dependency = this.#dependencies.get(name) as T;
    if (!dependency) {
      throw new AppError(`Dependency "${name}" not found.`, 500, 'DEPENDENCY_NOT_FOUND');
    }
    return dependency;
  }
}

/* Export a singleton instance
/* This could be replaced with a more complex DI framework if needed.
/* For example, InversifyJS or Awilix for more advanced features like scopes, async resolution, etc.
/* But for simplicity, a basic container suffices for this task.
/*/
export const container = new DIContainer();