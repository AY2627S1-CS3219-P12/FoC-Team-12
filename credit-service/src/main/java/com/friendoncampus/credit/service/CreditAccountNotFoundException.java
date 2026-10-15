package com.friendoncampus.credit.service;

import java.util.UUID;

public class CreditAccountNotFoundException extends RuntimeException {
    public CreditAccountNotFoundException(UUID userId) {
        super("Credit account does not exist for user " + userId);
    }
}
