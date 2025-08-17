# TaskFlow API – Refactored Solution

## Overview

This project is my submission for the **TaskFlow API – Senior Backend Engineer Coding Challenge**.
Over the last 2 days, I identified and resolved critical **performance, architectural, and security** issues. The goal was to refactor the existing NestJS + TypeORM + BullMQ (Redis) codebase into a **scalable, secure, and production-ready system**.

---

## 🔍 Core Problems Identified

### 1. Performance & Scalability Issues

* Inefficient **N+1 queries** for tasks and user relationships.
* In-memory filtering & pagination → caused memory pressure on large datasets.
* Batch operations (complete/delete tasks) triggered **excessive DB roundtrips**.
* No caching layer; every request hit PostgreSQL.

### 2. Architectural Weaknesses

* Controllers were directly calling repositories → violating separation of concerns.
* No **transaction handling** in multi-step operations.
* Missing **Redis integration** for distributed systems.
* Poorly implemented background jobs (BullMQ queue not processing correctly).

### 3. Security Gaps

* Authentication was minimal, no **JWT refresh tokens**.
* Authorization checks missing in sensitive routes.
* Raw error messages exposed DB internals.
* No input sanitization or rate limiting.

### 4. Reliability & Resilience

* Job workers failing silently, no retry/backoff mechanism.
* Missing caching invalidation.
* No structured logging or observability hooks.

---

## ✅ Improvements Made

### 1. Authentication & Security

* Implemented **JWT-based authentication** with access & refresh tokens.
* Added **role-based authorization (RBAC)** for admin/user separation.
* Secured error responses with standardized error format.
* Added request-level validation with `class-validator` to sanitize payloads.

### 2. Redis Caching Layer

* Integrated **Redis cache** for:

  * Frequently accessed tasks (`GET /tasks`).
  * User authentication sessions.
* Implemented **cache invalidation** on task create/update/delete.
* Added TTL (time-to-live) for cache entries to prevent stale data.

### 3. Batch Operations Fix

* Fixed `/tasks/batch` endpoint:

  * **`complete`** → marks multiple tasks as completed.
  * **`delete`** → deletes multiple tasks in one bulk DB query (instead of N queries).
* Improved error handling with clear responses per operation.

### 4. BullMQ Job Queue Fix

* Fixed **sample job worker** (`DispatchSampleFeeRefund` equivalent) to properly consume jobs.
* Added:

  * Retry strategy with exponential backoff.
  * Dead-letter queue (DLQ) for failed jobs.
  * Logging on job success/failure.
* Verified job persistence works with Redis (not in-memory).

### 5. Architectural Refactor

* Introduced **Service Layer** → controllers now delegate business logic to services.
* Added **transaction handling** via `QueryRunner` in TypeORM for multi-task ops.
* Applied **SOLID principles** for maintainability.
* Improved folder structure for modularity (auth, tasks, jobs, common utils).

---

## ⚡ Technical Decisions & Rationale

| Decision                             | Rationale                                | Tradeoffs                                 |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------- |
| Use **JWT + refresh token rotation** | Improves session security & scalability  | Requires extra token store in Redis       |
| Add **Redis cache for tasks**        | Huge performance gain on frequent reads  | Must handle invalidation carefully        |
| Fix **batch ops with bulk queries**  | Reduces DB load significantly            | Harder to give per-task error granularity |
| Implement **BullMQ retry/DLQ**       | Improves reliability in distributed jobs | Slight complexity in monitoring           |
| Add **service layer abstraction**    | Clean separation, easier to test         | Initial refactor cost was high            |

---

## 🚀 How to Run

### Prerequisites

* Node.js v16+
* Bun (latest)
* PostgreSQL
* Redis

### Setup

```bash
# Clone repository
git clone https://github.com/hareshnarolacs/scriptassist-nestjs-exercise.git
cd taskflow

# Install dependencies
bun install

# Setup env
cp .env.example .env
# → update PostgreSQL & Redis credentials

# DB setup
bun run build
bun run migration:run
bun run seed

# Start server
bun run start:dev
```

---

## 🔐 Default Users

**Admin**

* Email: `admin@example.com`
* Password: `admin123`

**User**

* Email: `user@example.com`
* Password: `user123`

---

## 📌 API Endpoints

### Auth

* `POST /auth/login` – login with email/password
* `POST /auth/register` – register new user
* `POST /auth/refresh` – refresh access token

### Tasks

* `GET /tasks` – list tasks (with filtering + pagination + Redis cache)
* `GET /tasks/:id` – task details
* `POST /tasks` – create task
* `PATCH /tasks/:id` – update task
* `DELETE /tasks/:id` – delete task
* `POST /tasks/batch` – bulk complete/delete tasks

### Jobs

* Background jobs processed with BullMQ + Redis
* Example: `DispatchSampleFeeRefund` now works with retries + DLQ

---

## 📊 Observability

* Added structured **logging** (success/failure logs for tasks & jobs).
* Error responses standardized for debugging.

---

## 🏆 Conclusion

This refactor makes **TaskFlow API**:

* **Faster** (optimized queries + Redis cache)
* **Safer** (JWT, RBAC, validation)
* **More reliable** (fixed job queues, retries, transactions)
* **Cleaner architecture** (service layer, SOLID principles)

---