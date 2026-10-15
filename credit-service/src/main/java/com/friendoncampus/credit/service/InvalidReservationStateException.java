package com.friendoncampus.credit.service;

public class InvalidReservationStateException extends RuntimeException {
    public InvalidReservationStateException(String detail) {
        super(detail);
    }
}
