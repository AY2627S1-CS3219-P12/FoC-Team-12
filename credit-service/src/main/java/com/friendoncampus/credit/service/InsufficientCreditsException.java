package com.friendoncampus.credit.service;

public class InsufficientCreditsException extends RuntimeException {
    public InsufficientCreditsException() {
        super("Available credit balance is insufficient");
    }
}
