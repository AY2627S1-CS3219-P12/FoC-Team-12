package com.friendoncampus.credit.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.domain.CreditOperation;
import com.friendoncampus.credit.domain.CreditOperationType;
import com.friendoncampus.credit.domain.CreditReservation;
import com.friendoncampus.credit.domain.LedgerEntryType;
import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;

@Service
public class CreditReservationService {

    private final CreditAccountRepository accounts;
    private final CreditReservationRepository reservations;
    private final CreditOperationRepository operations;
    private final CreditLedgerEntryRepository ledger;

    public CreditReservationService(
            CreditAccountRepository accounts,
            CreditReservationRepository reservations,
            CreditOperationRepository operations,
            CreditLedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.reservations = reservations;
        this.operations = operations;
        this.ledger = ledger;
    }

    @Transactional
    public ReservationResult reserve(UUID operationId, UUID orderId, UUID requesterId, int amount) {
        requireIdentifiers(operationId, orderId, requesterId);
        requirePositive(amount);
        String requestHash = fingerprint(CreditOperationType.RESERVE, orderId, requesterId, amount);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.RESERVE, requestHash);
            return currentResult(orderId, false);
        }

        CreditReservation existing = reservations.findByOrderId(orderId).orElse(null);
        if (existing != null) {
            if (!existing.getRequesterId().equals(requesterId) || existing.getAmount() != amount) {
                throw new ReservationConflictException();
            }
            CreditAccount account = requireAccount(requesterId, false);
            operations.save(CreditOperation.completed(
                    operationId, CreditOperationType.RESERVE, orderId, requestHash, "ALREADY_RESERVED"));
            return result(existing, account, false);
        }

        CreditAccount account = requireAccount(requesterId, true);
        try {
            account.reserve(amount);
        } catch (IllegalStateException exception) {
            throw new InsufficientCreditsException();
        }

        CreditReservation reservation = CreditReservation.active(orderId, requesterId, amount);
        operations.saveAndFlush(CreditOperation.completed(
                operationId, CreditOperationType.RESERVE, orderId, requestHash, "RESERVED"));
        reservations.saveAndFlush(reservation);
        accounts.save(account);
        ledger.save(CreditLedgerEntry.record(
                operationId,
                requesterId,
                reservation.getId(),
                LedgerEntryType.RESERVATION_CREATED,
                -amount,
                amount,
                account.getAvailableBalance(),
                account.getReservedBalance()));
        return result(reservation, account, true);
    }

    @Transactional
    public ReservationResult adjust(UUID operationId, UUID orderId, int newAmount) {
        requireIdentifiers(operationId, orderId);
        requirePositive(newAmount);
        String requestHash = fingerprint(CreditOperationType.ADJUST, orderId, newAmount);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.ADJUST, requestHash);
            return currentResult(orderId, false);
        }

        CreditReservation reservation = requireActiveReservation(orderId);
        CreditAccount account = requireAccount(reservation.getRequesterId(), true);
        int difference = newAmount - reservation.getAmount();
        LedgerEntryType entryType = null;

        if (difference > 0) {
            try {
                account.reserve(difference);
            } catch (IllegalStateException exception) {
                throw new InsufficientCreditsException();
            }
            entryType = LedgerEntryType.RESERVATION_INCREASED;
        } else if (difference < 0) {
            account.release(-difference);
            entryType = LedgerEntryType.RESERVATION_DECREASED;
        }

        reservation.adjustAmount(newAmount);
        operations.saveAndFlush(CreditOperation.completed(
                operationId,
                CreditOperationType.ADJUST,
                orderId,
                requestHash,
                difference == 0 ? "UNCHANGED" : "ADJUSTED"));
        reservations.save(reservation);
        accounts.save(account);

        if (difference != 0) {
            ledger.save(CreditLedgerEntry.record(
                    operationId,
                    account.getUserId(),
                    reservation.getId(),
                    entryType,
                    -difference,
                    difference,
                    account.getAvailableBalance(),
                    account.getReservedBalance()));
        }
        return result(reservation, account, difference != 0);
    }

    @Transactional
    public ReservationResult release(UUID operationId, UUID orderId) {
        requireIdentifiers(operationId, orderId);
        String requestHash = fingerprint(CreditOperationType.RELEASE, orderId);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.RELEASE, requestHash);
            return currentResult(orderId, false);
        }

        CreditReservation reservation = reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        CreditAccount account = requireAccount(reservation.getRequesterId(), true);

        if (reservation.getStatus() == ReservationStatus.RELEASED) {
            operations.save(CreditOperation.completed(
                    operationId, CreditOperationType.RELEASE, orderId, requestHash, "ALREADY_RELEASED"));
            return result(reservation, account, false);
        }
        if (reservation.getStatus() != ReservationStatus.ACTIVE) {
            throw new InvalidReservationStateException("Only an active reservation can be released");
        }

        int amount = reservation.getAmount();
        account.release(amount);
        reservation.release();
        operations.saveAndFlush(CreditOperation.completed(
                operationId, CreditOperationType.RELEASE, orderId, requestHash, "RELEASED"));
        reservations.save(reservation);
        accounts.save(account);
        ledger.save(CreditLedgerEntry.record(
                operationId,
                account.getUserId(),
                reservation.getId(),
                LedgerEntryType.RESERVATION_RELEASED,
                amount,
                -amount,
                account.getAvailableBalance(),
                account.getReservedBalance()));
        return result(reservation, account, true);
    }

    private ReservationResult currentResult(UUID orderId, boolean changed) {
        CreditReservation reservation = reservations.findByOrderId(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        CreditAccount account = requireAccount(reservation.getRequesterId(), false);
        return result(reservation, account, changed);
    }

    private CreditReservation requireActiveReservation(UUID orderId) {
        CreditReservation reservation = reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        if (reservation.getStatus() != ReservationStatus.ACTIVE) {
            throw new InvalidReservationStateException("Only an active reservation can be adjusted");
        }
        return reservation;
    }

    private CreditAccount requireAccount(UUID userId, boolean lock) {
        return (lock ? accounts.findByUserIdForUpdate(userId) : accounts.findById(userId))
                .orElseThrow(() -> new CreditAccountNotFoundException(userId));
    }

    private static ReservationResult result(
            CreditReservation reservation,
            CreditAccount account,
            boolean changed) {
        return new ReservationResult(
                reservation.getOrderId(),
                reservation.getId(),
                reservation.getRequesterId(),
                reservation.getAmount(),
                reservation.getStatus(),
                account.getAvailableBalance(),
                account.getReservedBalance(),
                changed);
    }

    private static String fingerprint(CreditOperationType type, Object... values) {
        StringBuilder canonical = new StringBuilder(type.name());
        for (Object value : values) {
            canonical.append('|').append(value);
        }
        return OperationFingerprint.sha256(canonical.toString());
    }

    private static void requireSameRequest(
            CreditOperation previous,
            CreditOperationType expectedType,
            String requestHash) {
        if (previous.getOperationType() != expectedType || !previous.getRequestHash().equals(requestHash)) {
            throw new IdempotencyConflictException();
        }
    }

    private static void requirePositive(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Credit amount must be positive");
        }
    }

    private static void requireIdentifiers(UUID... identifiers) {
        for (UUID identifier : identifiers) {
            if (identifier == null) {
                throw new IllegalArgumentException("Operation, order and user identifiers are required");
            }
        }
    }

    public record ReservationResult(
            UUID orderId,
            UUID reservationId,
            UUID requesterId,
            int amount,
            ReservationStatus status,
            int availableBalance,
            int reservedBalance,
            boolean changed) {
    }
}
