package com.friendoncampus.user.web;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*; import com.friendoncampus.user.service.DuplicateRegistrationException; import com.friendoncampus.user.service.InvalidCredentialsException;
@RestControllerAdvice class RegistrationExceptionHandler {
 @ExceptionHandler({IllegalArgumentException.class,DuplicateRegistrationException.class}) ProblemDetail invalid(RuntimeException e){ ProblemDetail p=ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,e.getMessage()); p.setTitle("Invalid registration"); return p; }
 @ExceptionHandler(InvalidCredentialsException.class) ProblemDetail invalidCredentials(){ ProblemDetail p=ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,"Invalid email or password"); p.setTitle("Authentication failed"); return p; }
}
