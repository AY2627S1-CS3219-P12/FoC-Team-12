package com.friendoncampus.notification.web.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.friendoncampus.notification.service.InvalidNotificationQueryException;

/** RFC-7807 {@code application/problem+json} errors, in the shape Order Service uses. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(InvalidNotificationQueryException.class)
    public ProblemDetail handleInvalidQuery(InvalidNotificationQueryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid notification query");
        problem.setProperty("code", "INVALID_QUERY");
        return problem;
    }
}
