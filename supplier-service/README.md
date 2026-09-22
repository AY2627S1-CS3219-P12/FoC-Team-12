# Supplier Service

Spring Boot service responsible for campus supplier and location data in Friend on Campus.

This initial scaffold provides a runnable, containerized application and a health endpoint.
Supplier APIs, database integration, and authentication will be added in later tasks.

## Prerequisites

- Java 17
- Docker Desktop, for running the containerized service

Maven does not need to be installed globally because the project includes the Maven Wrapper.

## Run the tests

From the `supplier-service` directory:

```sh
./mvnw test
```

## Run the application

```sh
./mvnw spring-boot:run
```

The service listens on port `8080` by default. Verify it in another terminal:

```sh
curl http://localhost:8080/actuator/health
```

The response will report an `UP` status, for example:

```json
{"groups":["liveness","readiness"],"status":"UP"}
```

## Run with Docker Compose

From the repository root, build the Supplier Service image:

```sh
docker compose build supplier-service
```

Start the service in the background:

```sh
docker compose up -d supplier-service
```

Check that the container is running and the application is healthy:

```sh
docker compose ps
curl http://localhost:8080/actuator/health
```

Confirm that the application runs as a non-root user:

```sh
docker compose exec supplier-service id
```

Stop and remove the container and Compose network:

```sh
docker compose down
```
