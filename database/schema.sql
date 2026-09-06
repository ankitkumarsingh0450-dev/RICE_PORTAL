CREATE DATABASE IF NOT EXISTS rice_portal;
USE rice_portal;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rice_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  so_date DATE,
  so_no VARCHAR(100) NOT NULL,
  customer_code VARCHAR(100),
  customer_name VARCHAR(255),
  plant_code VARCHAR(100),
  plant_name VARCHAR(255),
  article_code VARCHAR(100) NOT NULL,
  article_desc VARCHAR(255),
  product_family VARCHAR(150),
  product_class VARCHAR(150),
  product_brick VARCHAR(150),
  crop_type VARCHAR(150),
  so_value DECIMAL(18,2) DEFAULT 0,
  quantity_in_eaches DECIMAL(18,3) DEFAULT 0,
  case_lot DECIMAL(18,3) DEFAULT 0,
  case_quantity DECIMAL(18,3) DEFAULT 0,
  sales_unit VARCHAR(100),
  article_uom VARCHAR(100),
  so_weight_in_tons DECIMAL(18,3) DEFAULT 0,
  map VARCHAR(150),
  vendor_code VARCHAR(100),
  vendor_name VARCHAR(255),
  basic_cost DECIMAL(18,2) DEFAULT 0,
  freight_cost DECIMAL(18,2) DEFAULT 0,
  base_cost DECIMAL(18,2) DEFAULT 0,
  purchase_order VARCHAR(150),
  po_date DATE,
  billed_quantity DECIMAL(18,3) DEFAULT 0,
  billed_value DECIMAL(18,2) DEFAULT 0,
  pending_quantity DECIMAL(18,3) DEFAULT 0,
  pending_value DECIMAL(18,2) DEFAULT 0,
  billed_date DATE,
  billed_month VARCHAR(30),
  so_expiry_date DATE,
  so_expiry_status VARCHAR(50),
  rrl_po_no VARCHAR(150),
  valid_invalid VARCHAR(50),
  invalid_remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rice_so_article (so_no, article_code),
  INDEX idx_vendor (vendor_code),
  INDEX idx_article (article_code)
);

CREATE TABLE IF NOT EXISTS sauda_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sauda_id VARCHAR(100) NOT NULL,
  booking_date DATE NOT NULL,
  vendor_code VARCHAR(100),
  vendor_name VARCHAR(255),
  article_code VARCHAR(100),
  article_desc VARCHAR(255),
  state VARCHAR(100),
  booking_quantity_ea DECIMAL(18,3) DEFAULT 0,
  booking_rate DECIMAL(18,2) DEFAULT 0,
  booking_rate_per_bag DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sauda_match (vendor_code, article_code, booking_date)
);

INSERT IGNORE INTO users (username, password_hash)
VALUES ('admin', '$2b$10$wW4mJkJqYQY7n8v8qJ7o8u8k7jQJ6r3Xv7g4vYw2n7G4F1Qq3cZ5W');


CREATE TABLE IF NOT EXISTS vendor_invoice_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vitr_no VARCHAR(50) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  vendor_invoice_number VARCHAR(150) NOT NULL,
  vendor_code VARCHAR(100),
  vendor_name VARCHAR(255),
  purchase_order VARCHAR(150),
  vehicle_number VARCHAR(100),
  vehicle_status VARCHAR(100),
  vendor_invoice_pdf TEXT,
  rcpl_invoice_pdf TEXT,
  pod_pdf TEXT,
  status ENUM('Pending','finished') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vitr_vendor (vendor_code),
  INDEX idx_vitr_status (status)
);

CREATE TABLE IF NOT EXISTS vendor_invoice_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vitr_no VARCHAR(50) NOT NULL,
  so_no VARCHAR(100),
  rrl_po_no VARCHAR(150),
  article_code VARCHAR(100),
  article_desc VARCHAR(255),
  so_quantity DECIMAL(18,3) DEFAULT 0,
  invoice_quantity DECIMAL(18,3) DEFAULT 0,
  invoice_rate DECIMAL(18,2) DEFAULT 0,
  rcpl_invoice_no VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vitri_vitr (vitr_no),
  CONSTRAINT fk_vitri_vitr FOREIGN KEY (vitr_no) REFERENCES vendor_invoice_tracking(vitr_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  so_date DATE, sales_order_no VARCHAR(100) NOT NULL, rrl_po VARCHAR(150), billing_doc_no VARCHAR(100), billing_date DATE, billing_month VARCHAR(30), rcpl_po_no VARCHAR(150),
  customer_code VARCHAR(100), customer_name VARCHAR(255), plant_code VARCHAR(100), plant_name VARCHAR(255), article_code VARCHAR(100) NOT NULL, article_desc VARCHAR(255), product_family VARCHAR(150), product_class VARCHAR(150), product_brick VARCHAR(150),
  billing_quantity DECIMAL(18,3) DEFAULT 0, inv_quant DECIMAL(18,3) DEFAULT 0, gross_value DECIMAL(18,2) DEFAULT 0, net_value DECIMAL(18,2) DEFAULT 0, tax_amount DECIMAL(18,2) DEFAULT 0, cost_in_document DECIMAL(18,2) DEFAULT 0, gross_sales_per_unit DECIMAL(18,2) DEFAULT 0, net_sales_per_unit DECIMAL(18,2) DEFAULT 0, cost_per_unit DECIMAL(18,2) DEFAULT 0, margin_per_unit DECIMAL(18,2) DEFAULT 0, gross_margin DECIMAL(18,2) DEFAULT 0, margin_pct DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_so_article_bill (sales_order_no,article_code,billing_doc_no), INDEX idx_sales_so (sales_order_no), INDEX idx_sales_article(article_code)
);

CREATE TABLE IF NOT EXISTS cancelled_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, so_date DATE, so_no VARCHAR(100) NOT NULL, rrl_po_no VARCHAR(150), rcpl_po_no VARCHAR(150), customer_code VARCHAR(100), plant_code VARCHAR(100), plant_name VARCHAR(255), article_code VARCHAR(100) NOT NULL, article_desc VARCHAR(255), quantity DECIMAL(18,3) DEFAULT 0, rso_rtv VARCHAR(50), rso_rtv_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cancel_so_article_type_date (so_no,article_code,rso_rtv,rso_rtv_date)
);
