package com.friendoncampus.supplier.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class OpenApiConfiguration {

    @Bean
    OpenAPI supplierOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Friend on Campus Supplier API")
                .version("v1")
                .description("""
                        Manages campus suppliers for Friend on Campus. Public listings expose
                        active suppliers, while administrative listings expose active and
                        inactive suppliers. Administrative reads and all mutations are
                        temporarily unauthenticated for API-first development and will later
                        require the ADMIN role. Updates, status changes, and deletion use the
                        supplier version to prevent overwriting or deleting unseen changes.
                        """));
    }
}
