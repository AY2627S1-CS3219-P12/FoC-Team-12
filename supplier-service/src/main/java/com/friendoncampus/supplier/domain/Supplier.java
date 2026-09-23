package com.friendoncampus.supplier.domain;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "suppliers")
public class Supplier {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 100)
    private String type;

    @Column(nullable = false, length = 255)
    private String building;

    @Column(length = 20)
    private String floor;

    @Column(name = "location_description")
    private String locationDescription;

    @Column(nullable = false)
    private double latitude;

    @Column(nullable = false)
    private double longitude;

    @Column(name = "opening_time")
    private LocalTime openingTime;

    @Column(name = "closing_time")
    private LocalTime closingTime;

    @Column(name = "image_url")
    private String imageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SupplierStatus status;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected Supplier() {
    }

    public static Supplier create(
            String name,
            String type,
            String building,
            String floor,
            String locationDescription,
            double latitude,
            double longitude,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl,
            SupplierStatus status) {
        Supplier supplier = new Supplier();
        supplier.name = name;
        supplier.type = type;
        supplier.building = building;
        supplier.floor = floor;
        supplier.locationDescription = locationDescription;
        supplier.latitude = latitude;
        supplier.longitude = longitude;
        supplier.openingTime = openingTime;
        supplier.closingTime = closingTime;
        supplier.imageUrl = imageUrl;
        supplier.status = status;
        return supplier;
    }

    public void updateDetails(
            String name,
            String type,
            String building,
            String floor,
            String locationDescription,
            double latitude,
            double longitude,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl) {
        this.name = name;
        this.type = type;
        this.building = building;
        this.floor = floor;
        this.locationDescription = locationDescription;
        this.latitude = latitude;
        this.longitude = longitude;
        this.openingTime = openingTime;
        this.closingTime = closingTime;
        this.imageUrl = imageUrl;
    }

    @PrePersist
    void prepareForCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void prepareForUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public String getBuilding() {
        return building;
    }

    public String getFloor() {
        return floor;
    }

    public String getLocationDescription() {
        return locationDescription;
    }

    public double getLatitude() {
        return latitude;
    }

    public double getLongitude() {
        return longitude;
    }

    public LocalTime getOpeningTime() {
        return openingTime;
    }

    public LocalTime getClosingTime() {
        return closingTime;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public SupplierStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
