# Appointment Booking Service

This backend service manages provider availability, appointment booking, modification, cancellation, and emits relevant events. It serves as a core component for a larger scheduling platform.

Built with Node.js, TypeScript, Express, PostgreSQL, and Prisma, this implementation focuses on demonstrating functional correctness, robust backend design principles, clarity, maintainability, and readiness for discussion on architectural choices, scalability, and operational considerations expected in distributed systems.

## Tech Stack

* **Language:** TypeScript (ES2022 target)
* **Framework:** Node.js / Express.js
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Date/Time:** `date-fns` / `date-fns-tz`
* **Validation:** Zod
* **Testing:** Jest, `ts-jest`, Supertest
* **Containerization:** Docker / Docker Compose
* **Linting/Formatting:** Biome
* **Core Concepts Demonstrated:** Dependency Injection (custom container), Decorators (routing/validation), Async/Await, Error Handling, Event Emission (local mock), Concurrency Control (mock lock service), Branded Types.

## Challenges Faced During Implementation

*(Developer's Note: This section reflects on the process of building this service)*

The initial phase involved significant time investment in **spiking and mental modeling**. Defining the core entities, their relationships, and the flow of operations (availability checks, booking constraints, event emission) required careful consideration.

Architecturally, the goal was to create a clean, maintainable structure **inspired by patterns often seen in frameworks like NestJS (e.g., DI, services, repositories)**, but without adopting the full framework, which felt like overkill for this specific task's scope. The aim was a balance between simplicity and established OOP/DI patterns suitable for microservices. Implementing custom decorators for routing and validation, along with a basic DI container, achieved this but required careful design to ensure they worked reliably together.

Handling **timezones and concurrency** correctly were key challenges. Ensuring all date/time manipulations consistently accounted for the provider's specific timezone versus UTC storage required careful use of `date-fns-tz`. Implementing concurrency control that prevents double-booking while remaining scalable led to exploring different patterns (DB constraints vs. application locks) and settling on an explicit (though currently mocked) locking service pattern.

Finally, ensuring robust **validation** (especially for IANA timezones) and setting up a **testing** strategy (unit + integration with DB reset/seed) required dedicated effort to achieve good coverage(80%) and reliable test execution.


## Setup & Run Instructions

**Prerequisites:**

* Node.js (v18 or later recommended)
* npm (v9+ recommended)
* Docker & Docker Compose

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/shyaaam/appoitment-service-shyam
    cd appointment-service-shyam
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```
    *(Needed locally for Prisma CLI, seeding, testing, and local development)*

3.  **Create Environment File:**
    Copy `.env.example` to `.env`. Ensure `DATABASE_URL` matches the `docker-compose.yml` settings (if running via Docker) or your local Postgres setup.
    ```dotenv
    # .env
    DATABASE_URL="postgresql://user:password@localhost:5432/appointmentdb?schema=public"
    PORT=3000
    # NODE_ENV=development # Optional: uncomment for development logging/errors
    ```

4.  **Apply Database Migrations:**
    Ensure your database schema is created and up-to-date.
    ```bash
    # Create/update schema based on prisma/schema.prisma (development)
    npm run prisma:migrate

    # OR ensure DB matches schema (for environments where docker-compose runs deploy):
    # npx prisma db push # (Use with caution, primarily dev only)
    ```

5.  **(Optional) Seed the Database:**
    Populate the database with sample providers and appointments for testing. Run this *after* migrations are applied.
    ```bash
    npm run prisma:seed
    ```
    *(Note: The seed script first clears existing provider/appointment data)*

6.  **Run using Docker Compose (Recommended):**
    Builds the image, starts Postgres, waits for DB health, runs migrations (`prisma migrate deploy`), starts the app.
    ```bash
    docker-compose up --build
    ```
    The service will be available at `http://localhost:3000` (or the `PORT` specified in `.env`).

7.  **Run Locally (Alternative):**
    Requires a local PostgreSQL server running and the database created.
    a. Ensure Migrations & Seeding are done (Steps 4 & 5).
    b. Start the development server (with auto-reloading):
        ```bash
        npm run dev
        ```
    c. Or build and run the compiled code:
        ```bash
        npm run build
        npm start
        ```

8.  **Run Tests:**
    Executes Jest unit and integration tests. This script **resets the database** (using `prisma migrate reset --force`) and **re-seeds** it before running tests to ensure a clean state.
    ```bash
    npm test
    ```
    To run tests in watch mode (without auto-reset/seed):
    ```bash
    npm run test:watch
    ```
    To generate a coverage report:
    ```bash
    npm run test:cov
    ```

9.  **Build for Production (Docker):**
    The `Dockerfile` uses a multi-stage build to create an optimized production image.
    * **Using Docker Compose:** The `docker-compose up --build` command already builds this production-ready image as defined in the `Dockerfile`. The `command` in `docker-compose.yml` (`sh -c "npx prisma migrate deploy && node dist/server.js"`) ensures migrations run before starting the production server (`node dist/server.js`).
    * **Building Manually:** To build *just* the image without running the container:
        ```bash
        docker build -t your-image-name:latest .
        ```
        You can then push this image to a container registry and deploy it. Remember that the entry point expects the database to be available and migrations to have been run (or run as part of the deployment process).

10. **Stopping the Service (Docker):**
    ```bash
    docker-compose down
    ```
    To remove the persistent database volume (lose data): `docker-compose down -v`

## API Endpoints

* `POST /api/providers/:providerId/schedule`: Add/Update provider's schedule, timezone, duration.
* `GET /api/providers/:providerId/availability?date=YYYY-MM-DD`: Get available slots ("HH:mm") for a date.
* `GET /api/providers/:providerId/availability?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`: Get available slots for a date range.
* `POST /api/appointments`: Book a new appointment.
* `PUT /api/appointments/:appointmentId`: Reschedule an appointment.
* `DELETE /api/appointments/:appointmentId`: Cancel an appointment.
* `GET /api/appointments/:appointmentId`: Get appointment details.
* `GET /health`: Health check.

## Design Choices & Considerations

This section details key design decisions, alternatives considered, and their tradeoffs.

* **Language/Framework (TypeScript/Express.js):**
    * **Choice:** TypeScript for static typing and maintainability; Express.js for its minimalist and unopinionated nature.
    * **Rationale:** Allows focusing on core Node.js patterns, custom structure (decorators, DI), and explicit demonstration of concepts like concurrency control without the large overhead of a full framework. Provides flexibility.
    * **Alternative:** NestJS is a powerful, opinionated framework built on TypeScript, offering built-in modules for DI, validation, ORM integration, etc.
    * **Tradeoffs:** Express requires more manual setup (routing, validation integration, DI) but offers more control and potentially less "magic". NestJS accelerates development with conventions but has a steeper learning curve and more boilerplate.

* **Database (PostgreSQL & Prisma):**
    * **Choice:** As specified by requirements.
    * **Rationale:** PostgreSQL is a robust relational database. Prisma provides excellent type safety between the database and application code, simplifying data access and migrations.
    * **Tradeoffs:** Prisma adds a build step and generates a client; its abstraction might hide some complex SQL optimizations but significantly boosts developer productivity and type safety compared to raw SQL or simpler query builders.

* **Data Modeling:**
    * Uses distinct models for `Provider`, `ProviderSchedule`, and `Appointment`.
    * `ProviderSchedule` uses `dayOfWeek` string and `HH:mm` start/end times (interpreted in the provider's `timezone`).
    * `Appointment` stores `startTime` and `endTime` as full `DateTime` objects in **UTC**.
    * Unique constraints are used where appropriate (e.g., `providerId_dayOfWeek` for schedule, `providerId_startTime` for appointments).

* **Concurrency Control (Appointment Booking/Rescheduling):**
    * **Choice:** Application-level locking using a dedicated `ConcurrencyService` (currently mocked in-memory, designed for Redis in production) via `executeWithLock`. A preliminary availability check still occurs within the lock.
    * **Rationale:** Explicitly prevents race conditions *before* hitting the database for the target time slot. Provides a clear abstraction for locking logic.
    * **In-Memory Mock:** The current mock (`Map`-based) is **NOT production-safe** for multiple instances. It only demonstrates the pattern.
    * **Production Intent:** Replace the mock logic with Redis commands (`SET key value NX PX ttl`, `DEL key`) for distributed locking.
    * **Tradeoffs:**
        * *Application Lock vs. DB Constraint:* More complex than relying solely on the DB unique constraint but prevents unnecessary DB write attempts that would fail anyway. Provides more control over the locking mechanism (e.g., TTL).
        * *Distributed Lock Complexity:* Requires managing a Redis instance, handling potential Redis failures, choosing appropriate TTLs, and addressing stale locks (TTL helps, but isn't foolproof). Adds network latency for lock acquisition/release.
        * *Lock Contention:* High contention for popular slots could slow down requests waiting for locks.
    * **Alternatives Considered:**
        * *DB Unique Constraint Only:* (Initial implementation) Simpler, leverages DB atomicity. Risk: Wasted work if availability check passes but DB insert fails due to race condition just resolved by another request. Less control over locking behavior.
        * *Optimistic Locking (DB Version Column):* Add `version` to `Appointment`. Read row + version, check availability, `UPDATE ... SET version = version + 1 WHERE id = ? AND version = ?`. Handles broader update conflicts well but requires retry logic on version mismatch and careful transaction management.
        * *Pessimistic Locking (DB `SELECT ... FOR UPDATE`):* Lock DB rows/ranges during transaction. Simpler transaction logic but can severely limit throughput due to DB-level locks, higher risk of deadlocks.

* **State Management:**
    * **Choice:** PostgreSQL is the single source of truth. The service instances are designed to be stateless.
    * **Rationale:** Simplifies horizontal scaling. State consistency is managed by the database.

* **Event Emission:**
    * **Choice:** Simple Node.js `EventEmitter` wrapped in an `EventService` (mocked dependency).
    * **Rationale:** Fulfills the requirement simply for the assessment. Decouples event emission logic internally via the service wrapper and `IEventService` interface.
    * **Production Necessity:** This **must** be replaced by a robust message queue/broker (Kafka, RabbitMQ, AWS SQS/SNS) in production.
    * **Tradeoffs:** `EventEmitter` is synchronous (within-process), offers no persistence, retries, or scaling for consumers. Message queues provide asynchronous processing, decoupling, resilience, backpressure handling, and scalability but add operational overhead.

* **Validation:**
    * **Choice:** Zod for schema definition and parsing of API request bodies. Integration via custom `@ValidateBody` decorator.
    * **IANA Timezone Validation:** Uses `z.string().refine(isValidIANATimezone).transform(...)` where `isValidIANATimezone` uses `Intl.DateTimeFormat` check. Ensures only valid timezones are accepted via API.
    * **Rationale:** Zod provides excellent type inference and clear schema definitions. Centralized validation via decorators keeps controllers clean. Specific IANA check enhances robustness.
    * **Tradeoffs:** Custom decorator integration requires careful implementation compared to built-in framework validation.

* **Dependency Injection:**
    * **Choice:** Simple, custom Map-based DI container.
    * **Rationale:** Demonstrates understanding of DI principles (loose coupling, testability) without requiring a full framework like NestJS. Keeps dependencies minimal.
    * **Tradeoffs:** Lacks advanced features of mature DI frameworks (e.g., scopes, auto-wiring, module systems). Sufficient for this service's scale but might become cumbersome in larger applications.

* **Decorators:**
    * Used for routing (`@Controller`, `@Get`, etc.), validation (`@ValidateBody`), and demonstrating cross-cutting concerns (`@RateLimit`, `@Memoize` - basic examples).
    * **Rationale:** Provide a declarative way to define metadata and apply cross-cutting logic, leading to cleaner controller code. Leverages TypeScript's features.

* **Timezone Handling:**
    * Uses `date-fns` and `date-fns-tz` (v3).
    * Provider schedules defined relative to their `timezone`.
    * Appointments stored in **UTC** (`startTime`, `endTime`).
    * Conversions handled explicitly using `zonedTimeToUtc` and `formatInTimeZone`.
    * `IANATimezone` branded type used internally after validation/assertion for enhanced type safety.

* **Testing Strategy:**
    * **Unit Tests:** Jest + `ts-jest`. Focus on services and utilities. Mocks dependencies (repositories, other services) to test logic in isolation.
    * **Integration Tests:** Jest + Supertest. Test API endpoint behavior from request to response. Uses a real database connection (reset and seeded before test runs) to verify component interaction.
    * **Rationale:** Provides confidence at different levels – logic correctness (unit) and component interaction (integration).
    * **Tradeoffs:** Integration tests are slower and require careful test data management (reset/seed strategy). Mocking in unit tests can sometimes mask integration issues if mocks are inaccurate.

## Scalability Considerations

* **Stateless Service:** Enables horizontal scaling by running multiple instances behind a load balancer.
* **Database Scaling:**
    * **Read Replicas:** Essential for handling high read volume (e.g., availability checks). Configure application/Prisma to route reads to replicas.
    * **Vertical Scaling:** Increase DB server resources (CPU, RAM, IOPS). Often the first step.
    * **Indexing:** Critical for query performance. Ensure appropriate indexes are defined in `schema.prisma` (`@@index`) for common queries (e.g., finding appointments by provider/time range). Use `EXPLAIN ANALYZE` to diagnose slow queries.
    * **Connection Pooling:** Use Prisma's built-in pool, potentially tuning its size based on load and DB capacity.
    * **Sharding:** For extreme scale, partitioning data (e.g., by `providerId` or region) across multiple databases. Adds significant application and operational complexity.
* **Caching:**
    * **Strategy:** Use external distributed cache (Redis, Memcached).
    * **Targets:** Provider schedules and basic provider info are good candidates (cache invalidation needed on updates). Availability data is harder due to frequent changes; caching *booked* slots for short TTLs might be feasible. `@Memoize` decorator is an in-memory example, not suitable for distributed scale.
* **Asynchronous Processing:**
    * **Event Bus:** Replace `EventEmitter` with Kafka, RabbitMQ, etc., as discussed. This offloads work from the main request thread and improves resilience.
    * **Background Jobs:** Consider libraries like BullMQ (Redis-based) for other potentially long-running tasks if needed later.
* **Rate Limiting & Throttling:**
    * Implement robust, distributed rate limiting at the API Gateway or using middleware backed by Redis (e.g., `express-rate-limit` with `rate-limit-redis`). The `@RateLimit` decorator is a placeholder.
* **API Gateway:**
    * Use AWS API Gateway, Nginx, etc., in front of the service(s).
    * Handles SSL termination, load balancing, request routing, central authentication/authorization, caching, and rate limiting.
* **Network:** Deploy service instances and database geographically close. Use CDNs if serving related static assets.

## Assumptions

* Provider/Patient IDs are managed externally.
* Appointment durations are fixed per provider.
* Primary concurrency concern addressed is double-booking for the same slot.
* Event emission needs are met by a simple mock; downstream consumers are not implemented.
* Authentication/Authorization are outside the current scope.
* The environment supports `Intl` API for timezone validation.

## Discussion Readiness / Operational Concerns

This section highlights areas crucial for operating this service reliably in production.

* **Deployment & CI/CD:**
    * Strategy requires building Docker images, pushing to a registry (e.g., ECR, Docker Hub).
    * CI/CD pipeline should run linting, tests (unit, integration), security scans, build image, run DB migrations (`prisma migrate deploy`), and deploy (e.g., to ECS, EKS, App Runner).
    * Consider blue-green or canary deployment strategies.
* **Monitoring & Logging:**
    * **Structured Logging:** Log events in JSON format with context (request IDs, user IDs if applicable, provider IDs). Use a library like Pino or Winston. Centralize logs (ELK/EFK stack, CloudWatch Logs, Datadog Logs).
    * **Metrics:** Track key indicators: request latency (p50, p90, p99), error rates (4xx, 5xx), saturation (CPU, memory, DB connections), event queue depth/lag (for Kafka/RabbitMQ). Expose metrics via `/metrics` endpoint (Prometheus format).
    * **Alerting:** Set up alerts based on metrics and logs (e.g., high error rate, high latency, high consumer lag, DB CPU > 80%, out of memory). Tools: Prometheus Alertmanager, Datadog Monitors, CloudWatch Alarms.
    * **Distributed Tracing:** Crucial if this service interacts with others. Implement using OpenTelemetry to trace requests across service boundaries.
* **Error Handling & Debugging:**
    * The global error handler standardizes responses. Ensure adequate detail is logged (see above).
    * Use source maps (`tsconfig.json` `sourceMap: true`) for easier debugging of compiled code.
    * Correlate logs using request IDs.
* **Database Management:**
    * **Migrations:** Use `prisma migrate deploy` in production pipelines. Never use `dev` or `push`. Have rollback plans.
    * **Backups:** Implement regular, automated database backups and test restore procedures.
    * **Performance:** Monitor query performance, optimize slow queries, manage connection pool size.
* **Security:**
    * **Dependencies:** Regularly scan dependencies for vulnerabilities (`npm audit`, Snyk).
    * **Infrastructure:** Run containers as non-root users, limit network exposure.
    * **Application:** Use `helmet`, ensure robust input validation (Zod), implement proper authentication/authorization (e.g., JWT, OAuth - **currently missing**), protect against common web vulnerabilities (OWASP Top 10).
    * **Secrets Management:** Use environment variables (`.env`) locally, but use secure secret stores (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) in deployed environments. Never commit secrets.
* **Concurrency Implementation (Production):**
    * Requires robust Redis setup (HA, persistence if needed for locks).
    * Careful selection of lock TTLs.
    * Monitoring for lock contention or failures. Consider circuit breakers if Redis becomes unavailable.
* **Event Bus Management (Production):**
    * Monitoring queue depth, message throughput, consumer lag.
    * Handling poison pills / messages causing repeated consumer failures (Dead-Letter Queues).
    * Ensuring consumer idempotency (processing the same event multiple times should not cause issues).
    * Schema management/evolution for event payloads.
* **Resource Management:** Configure appropriate CPU/memory limits for containers. Monitor resource usage.
* **Disaster Recovery:** Plan for database failures (use replicas, point-in-time recovery), service instance failures (auto-scaling, health checks), availability zone failures (multi-AZ deployments).
* **Potential Code Improvements for Discussion:**
    * **Timezone Type Safety:** The current use of `assertIsValidIANATimezone` after reading from the DB works but adds runtime checks frequently. Alternatives:
        * Could a validation middleware transform API input strings directly into the `IANATimezone` type earlier, reducing internal assertions? (Still need DB read assertion).
        * Could a Value Object class (`class Timezone { constructor(value: string) { assertIsValid... } getValue(): IANATimezone { ... } }`) encapsulate the validation, though this adds boilerplate?
    * **Type Organization (`core/types.ts`):** The current `types.ts` might become cluttered. Consider organizing types by domain (e.g., `src/domain/appointment/appointment.types.ts`, `src/domain/provider/provider.types.ts`) or feature.
    * **Error Handling Granularity:** Could define more specific custom error classes (e.g., `LockAcquisitionFailedError`, `ScheduleConflictError`) inheriting from `AppError` for more precise handling or logging.
    * **Repository Abstraction:** Base repository class or interfaces could enforce common methods (findById, etc.) but might add complexity for this scale.
    * **Configuration Management:** Use a more structured config library (e.g., `convict`) instead of just `dotenv` for better validation and schema definition of environment variables.
    * **Concurrency Service Robustness:** The mock needs replacement. The Redis implementation should handle connection errors, potentially use Redlock algorithm for stronger guarantees if multiple Redis nodes are involved.

## System Diagram
```mermaid
graph TD
    subgraph Client Layer
        C["Client (Web/Mobile App)"]
    end

    subgraph API Layer
        LB["Load Balancer / API Gateway (External)"]
    end

    subgraph Application Layer Booking Service
        API["REST API (Controllers + Decorators)"]
        MIDDLEWARE["Middleware (Validation, Error Handling)"]
        SVC["Services (Provider, Appointment, Event, Concurrency)"]
        REPO["Repositories (Prisma)"]
        DI[DI Container]
        EVT_SVC[Event Service Wrapper]
        CONCUR_SVC["Concurrency Service (In-Memory Mock)"]
    end

    subgraph Data Layer
        DB([PostgreSQL Database])
    end

    subgraph Eventing Layer
        BUS{"Event Bus (Local EventEmitter Mock)"}
    end

    subgraph Downstream Systems
        DS["Downstream System (Conceptual)"]
    end

    C -- HTTPS Request --> LB;
    LB -- Forwarded Request --> API;
    API -- Uses --> MIDDLEWARE;
    MIDDLEWARE -- Processes --> API;
    API -- Resolves via --> DI;
    DI -- Provides --> SVC;
    SVC -- Resolves via --> DI;
    DI -- Provides --> REPO;
    DI -- Provides --> EVT_SVC;
    DI -- Provides --> CONCUR_SVC;

    SVC -- Calls --> REPO;
    SVC -- Calls --> CONCUR_SVC;
    REPO -- CRUD --> DB;

    SVC -- Triggers --> EVT_SVC;
    EVT_SVC -- Emits to --> BUS;
    BUS -.-> DS;

    DB -- Returns Data --> REPO;
    REPO -- Returns Data --> SVC;
    CONCUR_SVC -- Returns Result --> SVC;
    SVC -- Returns Data --> API;
    API -- Sends Response --> LB;
    LB -- HTTPS Response --> C;

