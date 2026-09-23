package com.friendoncampus.supplier.web.error;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.friendoncampus.supplier.service.InvalidSupplierQueryException;
import com.friendoncampus.supplier.service.SupplierNotFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(InvalidSupplierQueryException.class)
    public ProblemDetail handleInvalidSupplierQuery(InvalidSupplierQueryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                exception.getMessage());
        problem.setTitle("Invalid supplier query");
        return problem;
    }

    @ExceptionHandler(SupplierNotFoundException.class)
    public ProblemDetail handleSupplierNotFound(SupplierNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                exception.getMessage());
        problem.setTitle("Supplier not found");
        problem.setProperty("supplierId", exception.getSupplierId());
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        if (exception.getRequiredType() != UUID.class) {
            throw exception;
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Supplier ID '" + exception.getValue() + "' is not a valid UUID");
        problem.setTitle("Invalid supplier ID");
        return problem;
    }
}
