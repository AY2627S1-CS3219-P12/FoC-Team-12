package com.friendoncampus.user.web;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.user.service.EmailVerificationMailer;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(
        webEnvironment = WebEnvironment.MOCK,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:registration-login;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password="
        })
@AutoConfigureMockMvc
class RegistrationEmailVerificationLoginIntegrationTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private EmailVerificationMailer emailVerificationMailer;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void registrationCannotLoginUntilItsEmailVerificationCodeIsConfirmed() throws Exception {
        String email = "verification-flow@u.nus.edu";
        String password = "password-with-at-least-15-chars";

        mvc.perform(post("/api/users/registrations")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"username\":\"Verification Flow\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("UNVERIFIED"));

        mvc.perform(post("/api/users/login")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid email or password"));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationMailer).sendVerificationCode(eq(email), code.capture());

        mvc.perform(post("/api/users/email-verifications")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"code\":\"" + code.getValue() + "\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/users/login")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }
}
