FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /workspace
COPY pom.xml ./
RUN mvn --batch-mode --no-transfer-progress dependency:go-offline
COPY src ./src
RUN mvn --batch-mode --no-transfer-progress clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system spring && useradd --system --gid spring --no-create-home spring
COPY --from=builder --chown=spring:spring /workspace/target/chat-service-*.jar app.jar
USER spring:spring
EXPOSE 8085
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD curl --fail --silent http://localhost:8085/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
