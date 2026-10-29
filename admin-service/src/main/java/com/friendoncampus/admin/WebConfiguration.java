package com.friendoncampus.admin;

import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Controller
class AdminSpaController {
    @GetMapping({"/admin", "/admin/{*path}"})
    String frontend() { return "forward:/admin-assets/index.html"; }
}

@RestControllerAdvice
class ApiProblems {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ProblemDetail> status(ResponseStatusException ex) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(ex.getStatusCode(), ex.getReason() == null ? "Request failed" : ex.getReason());
        return ResponseEntity.status(ex.getStatusCode()).cacheControl(CacheControl.noStore()).body(p);
    }
}
