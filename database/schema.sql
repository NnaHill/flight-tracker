-- ============================================
-- Flight Price Tracker - MySQL Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS flight_tracker;
USE flight_tracker;

-- ============================================
-- Table: users
-- ============================================
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  phone           VARCHAR(20)   DEFAULT NULL,
  alert_preference ENUM('email', 'sms', 'both') NOT NULL DEFAULT 'email',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table: search_queries
-- ============================================
CREATE TABLE search_queries (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED  NOT NULL,
  origin_iata      CHAR(3)       NOT NULL,
  destination_iata CHAR(3)       NOT NULL,
  depart_date      DATE          NOT NULL,
  return_date      DATE          DEFAULT NULL,
  num_passengers   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  price_threshold  DECIMAL(10,2) NOT NULL,
  is_active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sq_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT chk_dates
    CHECK (return_date IS NULL OR return_date >= depart_date),

  CONSTRAINT chk_passengers
    CHECK (num_passengers BETWEEN 1 AND 9),

  INDEX idx_sq_user_id   (user_id),
  INDEX idx_sq_is_active (is_active),
  INDEX idx_sq_depart    (depart_date)
);

-- ============================================
-- Table: price_history
-- ============================================
CREATE TABLE price_history (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  query_id      INT UNSIGNED   NOT NULL,
  price         DECIMAL(10,2)  NOT NULL,
  currency      CHAR(3)        NOT NULL DEFAULT 'USD',
  airline       VARCHAR(100)   DEFAULT NULL,
  flight_number VARCHAR(20)    DEFAULT NULL,
  checked_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_ph_query
    FOREIGN KEY (query_id) REFERENCES search_queries(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_ph_query_id   (query_id),
  INDEX idx_ph_checked_at (checked_at)
);

-- ============================================
-- Table: alerts_log
-- ============================================
CREATE TABLE alerts_log (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  query_id       INT UNSIGNED  NOT NULL,
  alert_type     ENUM('email', 'sms') NOT NULL,
  price_at_alert DECIMAL(10,2) NOT NULL,
  sent_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_al_query
    FOREIGN KEY (query_id) REFERENCES search_queries(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_al_query_id (query_id),
  INDEX idx_al_sent_at  (sent_at)
);

-- ============================================
-- Seed: test user
-- ============================================
INSERT INTO users (name, email, phone, alert_preference)
VALUES ('Test User', 'test@example.com', '+11234567890', 'both');
