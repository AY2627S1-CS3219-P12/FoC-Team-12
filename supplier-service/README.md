# Supplier Service

Spring Boot service responsible for campus supplier and location data in Friend on Campus.

This initial scaffold provides a runnable application and a health endpoint. Supplier APIs,
database integration, authentication, and containerization will be added in later tasks.

## Prerequisites

- Java 17

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
