package com.friendoncampus.credit.service;

public class ReservationConflictException extends RuntimeException {
    public ReservationConflictException() {
        super("Order already has a different credit reservation");
    }
}
