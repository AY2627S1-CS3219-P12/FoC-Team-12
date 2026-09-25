package com.friendoncampus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayServiceApplicationTests {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    private static HttpServer userService;
    private static HttpServer supplierService;

    @LocalServerPort
    private int gatewayPort;

    @BeforeAll
    static void startDownstreams() {
        ensureDownstreamsStarted();
    }

    @AfterAll
    static void stopDownstreams() {
        userService.stop(0);
        supplierService.stop(0);
    }

    @DynamicPropertySource
    static void downstreamProperties(DynamicPropertyRegistry registry) {
        ensureDownstreamsStarted();
        registry.add("USER_SERVICE_URL", () -> serviceUrl(userService));
        registry.add("SUPPLIER_SERVICE_URL", () -> serviceUrl(supplierService));
    }

    @Test
    void forwardsUserApiMethodQueryAndBodyWithoutRewritingThePath() throws Exception {
        HttpRequest request = request("/api/users/login?returnTo=%2Fsuppliers")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"student@u.nus.edu\"}"))
                .build();

        HttpResponse<String> response = send(request);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"user\"")
                .contains("\"method\":\"POST\"")
                .contains("\"path\":\"/api/users/login\"")
                .contains("\"query\":\"returnTo=%2Fsuppliers\"")
                .contains("student@u.nus.edu");
    }

    @Test
    void forwardsSupplierApiAuthorizationBodyAndQuery() throws Exception {
        HttpRequest request = request("/api/suppliers/00000000-0000-0000-0000-000000000001?source=gateway")
                .header("Authorization", "Bearer signed-token")
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString("{\"version\":0}"))
                .build();

        HttpResponse<String> response = send(request);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"supplier\"")
                .contains("\"method\":\"PUT\"")
                .contains("\"path\":\"/api/suppliers/00000000-0000-0000-0000-000000000001\"")
                .contains("\"query\":\"source=gateway\"")
                .contains("\"authorization\":\"Bearer signed-token\"")
                .contains("\\\"version\\\":0");
    }

    @Test
    void routesAdministrativeSupplierApiToSupplierService() throws Exception {
        HttpResponse<String> response = send(request("/api/admin/suppliers?status=INACTIVE")
                .header("Authorization", "Bearer admin-token")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"supplier\"")
                .contains("\"path\":\"/api/admin/suppliers\"")
                .contains("\"query\":\"status=INACTIVE\"");
    }

    @Test
    void routesJwksToUserService() throws Exception {
        HttpResponse<String> response = get("/.well-known/jwks.json");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"keys\":[{\"kid\":\"test-key\"}]}");
    }

    @Test
    void mapsUserAndSupplierOpenApiDocuments() throws Exception {
        Map<String, String> expectedBodies = Map.of(
                "/docs/user/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"user\"}",
                "/docs/supplier/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"supplier\"}",
                "/docs/supplier/openapi.yaml", "openapi: 3.1.0\\nservice: supplier\\n");

        for (Map.Entry<String, String> expected : expectedBodies.entrySet()) {
            HttpResponse<String> response = get(expected.getKey());
            assertThat(response.statusCode()).as(expected.getKey()).isEqualTo(200);
            assertThat(response.body()).as(expected.getKey()).isEqualTo(expected.getValue());
        }

        HttpResponse<String> userYaml = get("/docs/user/openapi.yaml");
        assertThat(userYaml.statusCode()).isEqualTo(200);
        assertThat(userYaml.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/vnd.oai.openapi");
        assertThat(userYaml.body())
                .contains("openapi:", "3.1.0")
                .contains("service:", "user");
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 201, 204, 400, 401, 403, 404, 409})
    void preservesDownstreamStatuses(int downstreamStatus) throws Exception {
        HttpResponse<String> response = send(request("/api/suppliers/status-check")
                .header("X-Stub-Response-Status", Integer.toString(downstreamStatus))
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(downstreamStatus);
        if (downstreamStatus == 204) {
            assertThat(response.body()).isEmpty();
        } else if (downstreamStatus >= 400) {
            assertThat(response.headers().firstValue("Content-Type").orElse(""))
                    .startsWith("application/problem+json");
        }
    }

    @Test
    void exposesGatewayHealthAndRejectsUnknownRoutes() throws Exception {
        HttpResponse<String> health = get("/actuator/health");
        HttpResponse<String> missing = get("/not-a-configured-route");

        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("\"status\":\"UP\"");
        assertThat(missing.statusCode()).isEqualTo(404);
    }

    @Test
    void exposesSwaggerUiConfiguredForBothServices() throws Exception {
        HttpResponse<String> index = get("/swagger-ui/index.html");
        HttpResponse<String> configuration = get("/v3/api-docs/swagger-config");

        assertThat(index.statusCode()).isEqualTo(200);
        assertThat(index.body()).contains("Swagger UI");
        assertThat(configuration.statusCode()).isEqualTo(200);
        assertThat(configuration.body())
                .contains("/docs/user/openapi.json")
                .contains("/docs/supplier/openapi.json")
                .contains("Supplier Service");
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + gatewayPort + path))
                .timeout(Duration.ofSeconds(5));
    }

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        return send(request(path).GET().build());
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static synchronized void ensureDownstreamsStarted() {
        if (userService != null) {
            return;
        }
        try {
            userService = stubService("user");
            supplierService = stubService("supplier");
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to start gateway test downstreams", exception);
        }
    }

    private static HttpServer stubService(String name) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> respond(name, exchange));
        server.start();
        return server;
    }

    private static String serviceUrl(HttpServer server) {
        return "http://localhost:" + server.getAddress().getPort();
    }

    private static void respond(String serviceName, HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if ("/.well-known/jwks.json".equals(path)) {
            send(exchange, 200, "application/json", "{\"keys\":[{\"kid\":\"test-key\"}]}");
            return;
        }
        if ("/v3/api-docs".equals(path)) {
            send(exchange, 200, "application/json",
                    "{\"openapi\":\"3.1.0\",\"service\":\"" + serviceName + "\"}");
            return;
        }
        if ("/v3/api-docs.yaml".equals(path)) {
            send(exchange, 200, "application/yaml", "openapi: 3.1.0\\nservice: " + serviceName + "\\n");
            return;
        }

        int status = exchange.getRequestHeaders().getFirst("X-Stub-Response-Status") == null
                ? 200
                : Integer.parseInt(exchange.getRequestHeaders().getFirst("X-Stub-Response-Status"));
        if (status == 204) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        String query = exchange.getRequestURI().getRawQuery();
        String body = "{" +
                "\"backend\":\"" + json(serviceName) + "\"," +
                "\"method\":\"" + json(exchange.getRequestMethod()) + "\"," +
                "\"path\":\"" + json(path) + "\"," +
                "\"query\":" + nullableJson(query) + "," +
                "\"authorization\":" + nullableJson(authorization) + "," +
                "\"body\":\"" + json(requestBody) + "\"}";
        send(exchange, status, status >= 400 ? "application/problem+json" : "application/json", body);
    }

    private static void send(HttpExchange exchange, int status, String contentType, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().put("Content-Type", List.of(contentType));
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static String nullableJson(String value) {
        return value == null ? "null" : "\"" + json(value) + "\"";
    }

    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
