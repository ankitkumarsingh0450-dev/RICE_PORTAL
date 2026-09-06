USE rice_portal;

-- Run this once on an existing database before using the updated portal.
ALTER TABLE rice_data ADD COLUMN IF NOT EXISTS crop_type VARCHAR(150) AFTER product_brick;

CREATE TABLE IF NOT EXISTS vendor_invoice_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vitr_no VARCHAR(50) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  vendor_invoice_number VARCHAR(150) NOT NULL,
  vendor_code VARCHAR(100), vendor_name VARCHAR(255), purchase_order VARCHAR(150),
  vehicle_number VARCHAR(100), vehicle_status VARCHAR(100),
  vendor_invoice_pdf TEXT, rcpl_invoice_pdf TEXT, pod_pdf TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vitr_vendor(vendor_code), INDEX idx_vitr_status(status)
);
CREATE TABLE IF NOT EXISTS vendor_invoice_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vitr_no VARCHAR(50) NOT NULL,
  so_no VARCHAR(100), rrl_po_no VARCHAR(150), article_code VARCHAR(100), article_desc VARCHAR(255),
  so_quantity DECIMAL(18,3) DEFAULT 0, invoice_quantity DECIMAL(18,3) DEFAULT 0,
  invoice_rate DECIMAL(18,2) DEFAULT 0, rcpl_invoice_no VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vitri_vitr(vitr_no),
  CONSTRAINT fk_vitri_vitr FOREIGN KEY(vitr_no) REFERENCES vendor_invoice_tracking(vitr_no) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sales_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, so_date DATE, sales_order_no VARCHAR(100) NOT NULL,
  rrl_po VARCHAR(150), billing_doc_no VARCHAR(100), billing_date DATE, billing_month VARCHAR(30), rcpl_po_no VARCHAR(150),
  customer_code VARCHAR(100), customer_name VARCHAR(255), plant_code VARCHAR(100), plant_name VARCHAR(255),
  article_code VARCHAR(100) NOT NULL, article_desc VARCHAR(255), product_family VARCHAR(150), product_class VARCHAR(150), product_brick VARCHAR(150),
  billing_quantity DECIMAL(18,3) DEFAULT 0, inv_quant DECIMAL(18,3) DEFAULT 0, gross_value DECIMAL(18,2) DEFAULT 0,
  net_value DECIMAL(18,2) DEFAULT 0, tax_amount DECIMAL(18,2) DEFAULT 0, cost_in_document DECIMAL(18,2) DEFAULT 0,
  gross_sales_per_unit DECIMAL(18,2) DEFAULT 0, net_sales_per_unit DECIMAL(18,2) DEFAULT 0, cost_per_unit DECIMAL(18,2) DEFAULT 0,
  margin_per_unit DECIMAL(18,2) DEFAULT 0, gross_margin DECIMAL(18,2) DEFAULT 0, margin_pct DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_so_article_bill(sales_order_no,article_code,billing_doc_no)
);
CREATE TABLE IF NOT EXISTS cancelled_data (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, so_date DATE, so_no VARCHAR(100) NOT NULL, rrl_po_no VARCHAR(150), rcpl_po_no VARCHAR(150),
  customer_code VARCHAR(100), plant_code VARCHAR(100), plant_name VARCHAR(255), article_code VARCHAR(100) NOT NULL, article_desc VARCHAR(255),
  quantity DECIMAL(18,3) DEFAULT 0, rso_rtv VARCHAR(50), rso_rtv_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cancel_so_article_type_date(so_no,article_code,rso_rtv,rso_rtv_date)
);
