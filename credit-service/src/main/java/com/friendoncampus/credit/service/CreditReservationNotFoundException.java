package com.friendoncampus.credit.service;

import java.util.UUID;

public class CreditReservationNotFoundException extends RuntimeException {
    public CreditReservationNotFoundException(UUID orderId) {
        super("Credit reservation does not exist for order " + orderId);
    }
}
