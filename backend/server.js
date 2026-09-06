import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/uploads", express.static("uploads"));
fs.mkdirSync("uploads", { recursive: true });

/* =====================================================
   DATABASE
===================================================== */

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "ankit123",
  database: process.env.DB_NAME || "rice_portal",
  port: Number(process.env.DB_PORT || 3306),
  ssl: process.env.DB_SSL === "true" ? {
    minVersion: "TLSv1.2",
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {})
  } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

/* =====================================================
   FILE UPLOAD
===================================================== */

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const documentUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function storeDocument(file, folder = "rice-portal/vendor-invoices") {
  if (!file) return null;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (cloudName && uploadPreset) {
    const form = new FormData();
    const bytes = await fs.promises.readFile(file.path);
    form.append("file", new Blob([bytes], { type: file.mimetype || "application/pdf" }), file.originalname || file.filename);
    form.append("upload_preset", uploadPreset);
    form.append("folder", folder);
    form.append("resource_type", "raw");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, { method:"POST", body:form });
    if (!response.ok) throw new Error(`Cloudinary upload failed: ${response.status} ${await response.text()}`);
    const result = await response.json();
    fs.unlink(file.path, () => {});
    return result.secure_url || result.url;
  }
  return `/uploads/${file.filename}`;
}

function monthFromSoDate(date) {
  return date ? date.toISOString().slice(0,7) : null;
}


/* =====================================================
   RICE HEADERS
===================================================== */

const riceHeaders = [
  "SO DATE",
  "SO NO.",
  "CUSTOMER CODE",
  "CUSTOMER NAME",
  "PLANT CODE",
  "PLANT NAME",
  "ARTICLE CODE",
  "ARTICLE DESC.",
  "PRODUCT FAMILY",
  "PRODUCT CLASS",
  "PRODUCT BRICK",
  "CROP TYPE",
  "SO VALUE",
  "QUANTITY IN EACHES",
  "CASE LOT",
  "CASE QUANTITY",
  "SALES UNIT",
  "ARTICLE UOM",
  "SO WEIGHT IN TONS",
  "MAP",
  "VENDOR CODE",
  "VENDOR NAME",
  "BASIC COST",
  "FREIGHT COST",
  "BASE COST",
  "PURCHASE ORDER",
  "P.O. DATE",
  "BILLED QUNTITY",
  "BILLED VALUE",
  "PENDING QUANTITY",
  "PENDING VALUE",
  "BILLED DATE",
  "BILLED MONTH",
  "SO EXPIRY DATE",
  "SO EXPIRY STATUS",
  "RRL P.O. NO.",
  "VALID/INVALID",
  "INVALID REMARKS"
];

/* =====================================================
   BILLING HEADERS
===================================================== */

const billingHeaders = [
  "SO NO",
  "ARTICLE CODE",
  "BILLED QUNTITY",
  "BILLED VALUE",
  "PENDING QUANTITY",
  "PENDING VALUE",
  "BILLED DATE",
  "BILLED MONTH"
];

/* =====================================================
   HELPERS
===================================================== */

const clean = (value) => {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
};

const num = (value) => {
  const x = clean(value)
    .replace(/,/g, "")
    .replace(/â‚¹/g, "")
    .replace(/%/g, "")
    .trim();

  if (!x) {
    return 0;
  }

  const n = Number(x);

  return Number.isFinite(n) ? n : 0;
};

/* =====================================================
   DATE VALIDATION
===================================================== */

function isValidDate(year, month, day) {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const d = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/* =====================================================
   DATE FORMAT
===================================================== */

function formatDate(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

/* =====================================================
   DATE PARSER
===================================================== */

function dateOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let cleaned = clean(value);

  if (!cleaned) {
    return null;
  }

  cleaned = cleaned
    .replace(/^'+/, "")
    .replace(/\uFEFF/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  /* Excel serial date */

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const serial = Number(cleaned);

    if (
      serial >= 1 &&
      serial <= 2958465
    ) {
      const excelEpoch = new Date(
        Date.UTC(1899, 11, 30)
      );

      excelEpoch.setUTCDate(
        excelEpoch.getUTCDate() +
          Math.floor(serial)
      );

      const year =
        excelEpoch.getUTCFullYear();

      const month =
        excelEpoch.getUTCMonth() + 1;

      const day =
        excelEpoch.getUTCDate();

      if (
        year >= 1900 &&
        year <= 2100 &&
        isValidDate(year, month, day)
      ) {
        return formatDate(
          year,
          month,
          day
        );
      }
    }

    return null;
  }

  /* YYYY-MM-DD / YYYY/MM/DD */

  let match = cleaned.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
  );

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (
      isValidDate(
        year,
        month,
        day
      )
    ) {
      return formatDate(
        year,
        month,
        day
      );
    }

    return null;
  }

  /* DD/MM/YYYY / DD-MM-YYYY */

  match = cleaned.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
  );

  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    if (
      isValidDate(
        year,
        month,
        day
      )
    ) {
      return formatDate(
        year,
        month,
        day
      );
    }

    return null;
  }

  /* DD-MMM-YYYY / DD MMM YYYY */

  match = cleaned.match(
    /^(\d{1,2})[\s/-]+([A-Za-z]+)[\s/-]+(\d{4})$/
  );

  if (match) {
    const day = Number(match[1]);
    const monthText =
      match[2].toLowerCase();

    const year = Number(match[3]);

    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12
    };

    const month =
      months[monthText];

    if (
      month &&
      isValidDate(
        year,
        month,
        day
      )
    ) {
      return formatDate(
        year,
        month,
        day
      );
    }

    return null;
  }

  /* JS Date fallback */

  const d = new Date(cleaned);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  const year = d.getFullYear();

  if (
    year < 1900 ||
    year > 2100
  ) {
    return null;
  }

  const month =
    d.getMonth() + 1;

  const day =
    d.getDate();

  if (
    !isValidDate(
      year,
      month,
      day
    )
  ) {
    return null;
  }

  return formatDate(
    year,
    month,
    day
  );
}

/* =====================================================
   EXPIRY STATUS
===================================================== */

function expiryStatus(dateValue) {
  if (!dateValue) {
    return "ACTIVE";
  }

  const d = new Date(
    `${dateValue}T00:00:00`
  );

  const today = new Date();

  if (Number.isNaN(d.getTime())) {
    return "ACTIVE";
  }

  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (d.getTime() -
      today.getTime()) /
      86400000
  );

  if (diff < 0) {
    return "EXPIRED";
  }

  if (diff === 0) {
    return "EXPIRED TODAY";
  }

  if (diff === 1) {
    return "EXPIRING TOMORROW";
  }

  return "ACTIVE";
}

/* =====================================================
   CSV HEADER NORMALIZATION
===================================================== */

function normalizeHeader(value) {
  return clean(value)
    .replace(/^\uFEFF/, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}


const riceHeaderAliases = {
  "SALES ORDER NO.": "SO NO.",
  "SO NO": "SO NO.",
  "ARTICLE DESC": "ARTICLE DESC.",
  "QTY IN EA": "QUANTITY IN EACHES",
  "SO QUANTITY IN CASES": "CASE QUANTITY",
  "SO WEIGHT QTY IN TONNAGE": "SO WEIGHT IN TONS",
  "RRL PO NO.": "RRL P.O. NO.",
  "RRL PO NO": "RRL P.O. NO.",
  "BILLED QUANTITY": "BILLED QUNTITY",
  "SO VALUE": "SO VALUE",
  "CROP BRICK": "CROP TYPE"
};
function canonicalRiceHeader(value) {
  const h=normalizeHeader(value);
  return riceHeaderAliases[h] || h;
}

/* =====================================================
   CSV ROW NORMALIZATION
===================================================== */

function normalizeRow(row) {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[
      normalizeHeader(key)
    ] = clean(value);
  }

  return normalized;
}

/* =====================================================
   HEALTH
===================================================== */

app.get(
  "/api/health",
  async (req, res) => {
    try {
      await pool.query("SELECT 1");

      res.json({
        ok: true,
        message:
          "Database connected successfully"
      });
    } catch (e) {
      console.error(
        "DATABASE ERROR:",
        e
      );

      res.status(500).json({
        ok: false,
        error:
          e.message ||
          "Unknown database error",
        code: e.code || null
      });
    }
  }
);

/* =====================================================
   LOGIN
===================================================== */

app.post(
  "/api/login",
  async (req, res) => {
    try {
      const username =
        clean(req.body?.username);

      const password =
        clean(req.body?.password);

      if (
        username === "admin" &&
        password === "admin123"
      ) {
        const token =
          jwt.sign(
            { username },
            process.env.JWT_SECRET ||
              "dev-secret",
            {
              expiresIn: "8h"
            }
          );

        return res.json({
          token,
          username
        });
      }

      return res.status(401).json({
        message:
          "Invalid username or password"
      });
    } catch (e) {
      console.error(
        "Login error:",
        e
      );

      return res.status(500).json({
        message: "Login failed",
        error: e.message
      });
    }
  }
);

/* =====================================================
   DASHBOARD
   MONTH-WISE BASED ON SO DATE
===================================================== */

app.get(
  "/api/dashboard",
  async (req, res) => {
    try {
      /* =================================================
         OVERALL TOTALS
         SO VALUE IS NEVER MODIFIED BY BILLING UPLOAD
      ================================================= */

      const [[totals]] =
        await pool.query(`
          SELECT

            /* SO VALUE = ALL VALID + INVALID */
            COALESCE(
              SUM(so_value),
              0
            ) AS totalSoValue,

            /* BILLED VALUE = VALID ONLY */
            COALESCE(
              SUM(
                CASE
                  WHEN valid_invalid = 'VALID'
                  THEN billed_value
                  ELSE 0
                END
              ),
              0
            ) AS totalBilledValue,

            /* PENDING VALUE = VALID ONLY */
            COALESCE(
              SUM(
                CASE
                  WHEN valid_invalid = 'VALID'
                  THEN pending_value
                  ELSE 0
                END
              ),
              0
            ) AS totalPendingValue,

            /* SO QUANTITY = ALL */
            COALESCE(
              SUM(quantity_in_eaches),
              0
            ) AS totalSoQty,

            /* BILLED QUANTITY = VALID ONLY */
            COALESCE(
              SUM(
                CASE
                  WHEN valid_invalid = 'VALID'
                  THEN billed_quantity
                  ELSE 0
                END
              ),
              0
            ) AS totalBilledQty,

            /* PENDING QUANTITY = VALID ONLY */
            COALESCE(
              SUM(
                CASE
                  WHEN valid_invalid = 'VALID'
                  THEN pending_quantity
                  ELSE 0
                END
              ),
              0
            ) AS totalPendingQty

          FROM rice_data
        `);


      /* =================================================
         MONTH-WISE DASHBOARD

         IMPORTANT:
         Month is calculated from SO DATE,
         NOT from BILLED MONTH.

         Example:
         2026-01-05 -> Jan-2026
         2026-02-10 -> Feb-2026
         2026-03-15 -> Mar-2026

         This keeps SO VALUE complete month-wise.
      ================================================= */

      const [months] =
        await pool.query(`
          SELECT

            DATE_FORMAT(
              MIN(so_date),
              '%b-%Y'
            ) AS month,

            DATE_FORMAT(
              MIN(so_date),
              '%Y-%m-01'
            ) AS monthDate,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue,

            COALESCE(
              SUM(quantity_in_eaches),
              0
            ) AS soQty,

            COALESCE(
              SUM(billed_quantity),
              0
            ) AS billedQty,

            COALESCE(
              SUM(pending_quantity),
              0
            ) AS pendingQty

          FROM rice_data

          WHERE
            so_date IS NOT NULL
            AND valid_invalid = 'VALID'

          GROUP BY
            YEAR(so_date),
            MONTH(so_date)

          ORDER BY
            YEAR(so_date),
            MONTH(so_date)
        `);


      /* =================================================
         UNKNOWN / BLANK SO DATE

         Records without SO DATE are kept separately
         so their SO VALUE is not lost.
      ================================================= */

      const [[unknownMonth]] =
        await pool.query(`
          SELECT

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue,

            COALESCE(
              SUM(quantity_in_eaches),
              0
            ) AS soQty,

            COALESCE(
              SUM(billed_quantity),
              0
            ) AS billedQty,

            COALESCE(
              SUM(pending_quantity),
              0
            ) AS pendingQty

          FROM rice_data

          WHERE
            so_date IS NULL
        `);


      /* =================================================
         ADD UNKNOWN ONLY WHEN DATA EXISTS
      ================================================= */

      if (
        Number(
          unknownMonth?.soValue || 0
        ) !== 0 ||

        Number(
          unknownMonth?.billedValue || 0
        ) !== 0 ||

        Number(
          unknownMonth?.pendingValue || 0
        ) !== 0 ||

        Number(
          unknownMonth?.soQty || 0
        ) !== 0
      ) {
        months.push({
          month: "Unknown",
          monthDate: null,

          soValue:
            unknownMonth.soValue || 0,

          billedValue:
            unknownMonth.billedValue || 0,

          pendingValue:
            unknownMonth.pendingValue || 0,

          soQty:
            unknownMonth.soQty || 0,

          billedQty:
            unknownMonth.billedQty || 0,

          pendingQty:
            unknownMonth.pendingQty || 0
        });
      }


      /* =================================================
         VENDOR-WISE
      ================================================= */

      const [vendors] =
        await pool.query(`
          SELECT

            vendor_code AS vendorCode,

            vendor_name AS vendorName,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            vendor_code,
            vendor_name

          ORDER BY
            pendingValue DESC

          LIMIT 20
        `);


      /* =================================================
         ARTICLE-WISE
      ================================================= */

      const [articles] =
        await pool.query(`
          SELECT

            article_code AS articleCode,

            article_desc AS articleDesc,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            article_code,
            article_desc

          ORDER BY
            soValue DESC

          LIMIT 10
        `);


      /* =================================================
         CUSTOMER-WISE
      ================================================= */

      const [customers] =
        await pool.query(`
          SELECT

            customer_code AS customerCode,

            customer_name AS customerName,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            customer_code,
            customer_name

          ORDER BY
            soValue DESC

          LIMIT 20
        `);


      /* =================================================
         PRODUCT BRICK-WISE
      ================================================= */

      const [bricks] =
        await pool.query(`
          SELECT

            product_brick AS productBrick,

            vendor_name AS vendorName,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            product_brick,
            vendor_name

          ORDER BY
            billedValue DESC

          LIMIT 30
        `);


      /* =================================================
         RESPONSE
      ================================================= */

      res.json({
        totals,

        /* Month-wise dashboard data */
        months,

        vendors,

        articles,

        customers,

        bricks
      });

    } catch (e) {

      console.error(
        "Dashboard error:",
        e
      );

      res.status(500).json({

        message:
          "Dashboard data failed",

        error:
          e.message
      });
    }
  }
);
/* =====================================================
   RICE FILTER
===================================================== */

function riceFilter(req) {
  const {
    search,
    vendor,
    customer,
    plant,
    brick,
    status,
    fromDate,
    toDate
  } = req.query;

  const clauses = [];
  const params = [];

  const addLike = (
    value,
    fields
  ) => {
    if (!clean(value)) {
      return;
    }

    const like =
      `%${clean(value)}%`;

    clauses.push(
      `(${fields
        .map(
          (field) =>
            `${field} LIKE ?`
        )
        .join(" OR ")})`
    );

    fields.forEach(() => {
      params.push(like);
    });
  };

  addLike(search, [
    "so_no",
    "article_code",
    "article_desc",
    "vendor_code",
    "vendor_name",
    "customer_code",
    "customer_name",
    "purchase_order"
  ]);

  addLike(vendor, [
    "vendor_code",
    "vendor_name"
  ]);

  addLike(customer, [
    "customer_code",
    "customer_name"
  ]);

  addLike(plant, [
    "plant_code",
    "plant_name"
  ]);

  addLike(brick, [
    "product_brick"
  ]);

  const currentStatus =
    clean(status).toUpperCase();

  if (currentStatus === "BILLED") {
    clauses.push(`
      billed_quantity > 0
      AND pending_quantity <= 0
    `);
  }

  if (currentStatus === "PENDING") {
    clauses.push(`
      pending_quantity > 0
      AND billed_quantity <= 0
    `);
  }

  if (currentStatus === "PARTIAL") {
    clauses.push(`
      billed_quantity > 0
      AND pending_quantity > 0
    `);
  }

  if (clean(fromDate)) {
    const parsed =
      dateOrNull(fromDate);

    if (parsed) {
      clauses.push(
        "so_date >= ?"
      );

      params.push(parsed);
    }
  }

  if (clean(toDate)) {
    const parsed =
      dateOrNull(toDate);

    if (parsed) {
      clauses.push(
        "so_date <= ?"
      );

      params.push(parsed);
    }
  }

  return {
    where:
      clauses.length
        ? `WHERE ${clauses.join(
            " AND "
          )}`
        : "",
    params
  };
}

/* =====================================================
   RICE DATA
===================================================== */

app.get(
  "/api/rice-data",
  async (req, res) => {
    try {
      const page = Math.max(
        1,
        parseInt(
          req.query.page || "1",
          10
        )
      );

      const pageSize = Math.min(
        200,
        Math.max(
          10,
          parseInt(
            req.query.pageSize ||
              "50",
            10
          )
        )
      );

      const {
        where,
        params
      } = riceFilter(req);

      const [[countRow]] =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM rice_data
          ${where}
          `,
          params
        );

      const total =
        Number(
          countRow?.total || 0
        );

      const offset =
        (page - 1) *
        pageSize;

      const [rows] =
        await pool.query(
          `
          SELECT *
          FROM rice_data
          ${where}
          ORDER BY id DESC
          LIMIT ? OFFSET ?
          `,
          [
            ...params,
            pageSize,
            offset
          ]
        );

      res.json({
        rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages:
            Math.max(
              1,
              Math.ceil(
                total /
                  pageSize
              )
            )
        }
      });
    } catch (e) {
      console.error(
        "Rice data error:",
        e
      );

      res.status(500).json({
        message:
          "Unable to load Rice Data",
        error: e.message
      });
    }
  }
);

/* =====================================================
   RICE EXPORT
===================================================== */

app.get(
  "/api/rice-data/export",
  async (req, res) => {
    try {
      const {
        where,
        params
      } = riceFilter(req);

      const [rows] =
        await pool.query(
          `
          SELECT *
          FROM rice_data
          ${where}
          ORDER BY id DESC
          `,
          params
        );

      const columns =
        rows.length
          ? Object.keys(rows[0])
          : [
              "SO DATE",
              "SO NO.",
              "ARTICLE CODE",
              "VENDOR NAME"
            ];

      const esc = (value) => {
        return `"${String(
          value ?? ""
        ).replace(
          /"/g,
          '""'
        )}"`;
      };

      const csvText = [
        columns
          .map(esc)
          .join(","),

        ...rows.map(
          (row) =>
            columns
              .map(
                (column) =>
                  esc(
                    row[column]
                  )
              )
              .join(",")
        )
      ].join("\r\n");

      const format =
        clean(
          req.query.format
        ).toLowerCase() ===
        "xls"
          ? "xls"
          : "csv";

      const filename =
        `rice_data_export_${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.${format}`;

      if (format === "xls") {
        const cell = (
          value
        ) => {
          return String(
            value ?? ""
          )
            .replace(
              /&/g,
              "&amp;"
            )
            .replace(
              /</g,
              "&lt;"
            )
            .replace(
              />/g,
              "&gt;"
            )
            .replace(
              /"/g,
              "&quot;"
            );
        };

        const html = `
          <html>
            <head>
              <meta charset="utf-8">
            </head>

            <body>
              <table border="1">
                <tr>
                  ${columns
                    .map(
                      (column) =>
                        `<th>${cell(
                          column
                        )}</th>`
                    )
                    .join("")}
                </tr>

                ${rows
                  .map(
                    (row) => `
                    <tr>
                      ${columns
                        .map(
                          (
                            column
                          ) =>
                            `<td>${cell(
                              row[
                                column
                              ]
                            )}</td>`
                        )
                        .join("")}
                    </tr>
                  `
                  )
                  .join("")}
              </table>
            </body>
          </html>
        `;

        res.setHeader(
          "Content-Type",
          "application/vnd.ms-excel; charset=utf-8"
        );

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );

        return res.send(
          html
        );
      }

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      return res.send(
        "\ufeff" +
          csvText
      );
    } catch (e) {
      console.error(
        "Rice export error:",
        e
      );

      res.status(500).json({
        message:
          "Rice Data export failed",
        error: e.message
      });
    }
  }
);

/* =====================================================
   MANUAL DUPLICATE CLEANUP
   NOTE:
   Normal CSV upload DOES NOT remove duplicates.
   This endpoint only works when manually called.
===================================================== */

app.post(
  "/api/rice-data/remove-duplicates",
  async (req, res) => {
    let conn;

    try {
      conn =
        await pool.getConnection();

      await conn.beginTransaction();

      const [[before]] =
        await conn.query(`
          SELECT COUNT(*) AS total
          FROM rice_data
        `);

      const [result] =
        await conn.query(`
          DELETE r1
          FROM rice_data r1
          INNER JOIN rice_data r2
            ON r1.so_no = r2.so_no
            AND r1.article_code =
                r2.article_code
            AND r1.id < r2.id
        `);

      await conn.commit();

      const beforeCount =
        Number(
          before?.total || 0
        );

      const removed =
        Number(
          result?.affectedRows ||
            0
        );

      res.json({
        message: removed
          ? `${removed} duplicate Rice Data rows removed`
          : "No duplicate Rice Data found",

        removed,

        before:
          beforeCount,

        after:
          beforeCount -
          removed
      });
    } catch (e) {
      if (conn) {
        await conn.rollback();
      }

      console.error(
        "Duplicate cleanup error:",
        e
      );

      res.status(500).json({
        message:
          "Unable to remove duplicate Rice Data",
        error: e.message
      });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
);

/* =====================================================
   RICE CSV UPLOAD
   IMPORTANT:
   DUPLICATES ARE ALLOWED.
   EVERY CSV ROW IS INSERTED AS NEW ROW.
===================================================== */

app.post(
  "/api/upload/rice",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message:
          "CSV file required"
      });
    }

    const rows = [];

    try {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          let headerError =
            null;

          fs.createReadStream(
            req.file.path
          )
            .pipe(
              csv({
                skipLines: 0,

                mapHeaders: ({header}) => canonicalRiceHeader(header)
              })
            )

            .on(
              "headers",
              (headers) => {
                const got = headers.map(canonicalRiceHeader);

                const missing =
                  riceHeaders.filter(
                    (h) =>
                      !got.includes(
                        h
                      )
                  );

                if (
                  missing.length
                ) {
                  headerError =
                    new Error(
                      "Invalid Rice Data header. Missing: " +
                        missing.join(
                          ", "
                        )
                    );
                }
              }
            )

            .on(
              "data",
              (row) => {
                if (
                  !headerError
                ) {
                  rows.push(
                    normalizeRow(
                      row
                    )
                  );
                }
              }
            )

            .on(
              "end",
              () => {
                if (
                  headerError
                ) {
                  reject(
                    headerError
                  );
                } else {
                  resolve();
                }
              }
            )

            .on(
              "error",
              reject
            );
        }
      );

      if (!rows.length) {
        return res.status(400).json({
          message:
            "CSV file contains no data rows"
        });
      }

      const conn =
        await pool.getConnection();

      let inserted = 0;

      try {
        await conn.beginTransaction();

        for (const r of rows) {
          const soDate =
            dateOrNull(
              r["SO DATE"]
            );

          const poDate =
            dateOrNull(
              r["P.O. DATE"]
            );

          const billedDate =
            dateOrNull(
              r["BILLED DATE"]
            );

          const expiry =
            dateOrNull(
              r[
                "SO EXPIRY DATE"
              ]
            );

          /*
             IMPORTANT:
             NO ON DUPLICATE KEY UPDATE

             Every row will be inserted,
             including duplicate SO + ARTICLE.
          */

          await conn.execute(
            `
            INSERT INTO rice_data (
              so_date,
              so_no,
              customer_code,
              customer_name,
              plant_code,
              plant_name,
              article_code,
              article_desc,
              product_family,
              product_class,
              product_brick,
              crop_type,
              so_value,
              quantity_in_eaches,
              case_lot,
              case_quantity,
              sales_unit,
              article_uom,
              so_weight_in_tons,
              map,
              vendor_code,
              vendor_name,
              basic_cost,
              freight_cost,
              base_cost,
              purchase_order,
              po_date,
              billed_quantity,
              billed_value,
              pending_quantity,
              pending_value,
              billed_date,
              billed_month,
              so_expiry_date,
              so_expiry_status,
              rrl_po_no,
              valid_invalid,
              invalid_remarks
            )
            VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?
            )
            ON DUPLICATE KEY UPDATE
              so_date=VALUES(so_date), customer_code=VALUES(customer_code), customer_name=VALUES(customer_name),
              plant_code=VALUES(plant_code), plant_name=VALUES(plant_name), article_desc=VALUES(article_desc),
              product_family=VALUES(product_family), product_class=VALUES(product_class), product_brick=VALUES(product_brick), crop_type=VALUES(crop_type),
              so_value=VALUES(so_value), quantity_in_eaches=VALUES(quantity_in_eaches), case_lot=VALUES(case_lot), case_quantity=VALUES(case_quantity),
              sales_unit=VALUES(sales_unit), article_uom=VALUES(article_uom), so_weight_in_tons=VALUES(so_weight_in_tons), map=VALUES(map),
              vendor_code=VALUES(vendor_code), vendor_name=VALUES(vendor_name), basic_cost=VALUES(basic_cost), freight_cost=VALUES(freight_cost), base_cost=VALUES(base_cost),
              purchase_order=VALUES(purchase_order), po_date=VALUES(po_date), billed_quantity=VALUES(billed_quantity), billed_value=VALUES(billed_value),
              pending_quantity=VALUES(pending_quantity), pending_value=VALUES(pending_value), billed_date=VALUES(billed_date), billed_month=VALUES(billed_month),
              so_expiry_date=VALUES(so_expiry_date), so_expiry_status=VALUES(so_expiry_status), rrl_po_no=VALUES(rrl_po_no), valid_invalid=VALUES(valid_invalid), invalid_remarks=VALUES(invalid_remarks)
            `,
            [
              soDate,

              clean(
                r["SO NO."]
              ),

              clean(
                r[
                  "CUSTOMER CODE"
                ]
              ),

              clean(
                r[
                  "CUSTOMER NAME"
                ]
              ),

              clean(
                r[
                  "PLANT CODE"
                ]
              ),

              clean(
                r[
                  "PLANT NAME"
                ]
              ),

              clean(
                r[
                  "ARTICLE CODE"
                ]
              ),

              clean(
                r[
                  "ARTICLE DESC."
                ]
              ),

              clean(
                r[
                  "PRODUCT FAMILY"
                ]
              ),

              clean(
                r[
                  "PRODUCT CLASS"
                ]
              ),

              clean(
                r[
                  "PRODUCT BRICK"
                ]
              ),

              clean(
                r["CROP TYPE"] || r["CROP BRICK"]
              ),

              num(
                r["SO VALUE"]
              ),

              num(
                r[
                  "QUANTITY IN EACHES"
                ]
              ),

              num(
                r["CASE LOT"]
              ),

              num(
                r[
                  "CASE QUANTITY"
                ]
              ),

              clean(
                r["SALES UNIT"]
              ),

              clean(
                r["ARTICLE UOM"]
              ),

              num(
                r[
                  "SO WEIGHT IN TONS"
                ]
              ),

              clean(
                r["MAP"]
              ),

              clean(
                r[
                  "VENDOR CODE"
                ]
              ),

              clean(
                r[
                  "VENDOR NAME"
                ]
              ),

              num(
                r[
                  "BASIC COST"
                ]
              ),

              num(
                r[
                  "FREIGHT COST"
                ]
              ),

              num(
                r["BASE COST"]
              ),

              clean(
                r[
                  "PURCHASE ORDER"
                ]
              ),

              poDate,

              num(
                r[
                  "BILLED QUNTITY"
                ]
              ),

              num(
                r[
                  "BILLED VALUE"
                ]
              ),

              num(
                r[
                  "PENDING QUANTITY"
                ]
              ),

              num(
                r[
                  "PENDING VALUE"
                ]
              ),

              billedDate,

              clean(
                r[
                  "BILLED MONTH"
                ]
              ),

              expiry,

              expiryStatus(
                expiry
              ),

              clean(
                r[
                  "RRL P.O. NO."
                ]
              ),

              clean(
                r[
                  "VALID/INVALID"
                ]
              ),

              clean(
                r[
                  "INVALID REMARKS"
                ]
              )
            ]
          );

          inserted++;
        }

        await conn.commit();
      } catch (dbError) {
        await conn.rollback();
        throw dbError;
      } finally {
        conn.release();
      }

      return res.json({
        message:
          `${rows.length} Rice Data rows inserted successfully`,

        totalRows:
          rows.length,

        inserted,

        updated: 0
      });
    } catch (e) {
      console.error(
        "Rice CSV upload error:",
        e
      );

      return res.status(400).json({
        message:
          "Rice Data upload failed",

        error:
          e.message
      });
    } finally {
      if (req.file?.path) {
        fs.unlink(
          req.file.path,
          () => {}
        );
      }
    }
  }
);

/* =====================================================
   BILLING UPLOAD
===================================================== */

app.post(
  "/api/upload/billing",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message:
          "CSV file required"
      });
    }

    const rows = [];

    try {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          let headerError =
            null;

          fs.createReadStream(
            req.file.path
          )
            .pipe(
              csv({
                mapHeaders:
                  ({
                    header
                  }) =>
                    normalizeHeader(
                      header
                    )
              })
            )

            .on(
              "headers",
              (headers) => {
                const got =
                  headers.map(
                    normalizeHeader
                  );

                const missing =
                  billingHeaders.filter(
                    (header) =>
                      !got.includes(
                        header
                      )
                  );

                if (
                  missing.length
                ) {
                  headerError =
                    new Error(
                      "Invalid Billing Status header. Missing: " +
                        missing.join(
                          ", "
                        )
                    );
                }
              }
            )

            .on(
              "data",
              (row) => {
                if (
                  !headerError
                ) {
                  rows.push(
                    normalizeRow(
                      row
                    )
                  );
                }
              }
            )

            .on(
              "end",
              () => {
                if (
                  headerError
                ) {
                  reject(
                    headerError
                  );
                } else {
                  resolve();
                }
              }
            )

            .on(
              "error",
              reject
            );
        }
      );

      if (!rows.length) {
        return res.status(400).json({
          message:
            "Billing CSV contains no data rows"
        });
      }

      const conn =
        await pool.getConnection();

      let updated = 0;
      let notFound = 0;

      try {
        await conn.beginTransaction();

        for (const r of rows) {
          const billedDate =
            dateOrNull(
              r["BILLED DATE"]
            );

          const [
            result
          ] =
            await conn.execute(
              `
              UPDATE rice_data
              SET
                billed_quantity = ?,
                billed_value = ?,
                pending_quantity = ?,
                pending_value = ?,
                billed_date = ?,
                billed_month = ?

              WHERE
                so_no = ?
                AND article_code = ?
              `,
              [
                num(
                  r[
                    "BILLED QUNTITY"
                  ]
                ),

                num(
                  r[
                    "BILLED VALUE"
                  ]
                ),

                num(
                  r[
                    "PENDING QUANTITY"
                  ]
                ),

                num(
                  r[
                    "PENDING VALUE"
                  ]
                ),

                billedDate,

                clean(
                  r[
                    "BILLED MONTH"
                  ]
                ),

                clean(
                  r["SO NO"]
                ),

                clean(
                  r[
                    "ARTICLE CODE"
                  ]
                )
              ]
            );

          if (
            result.affectedRows >
            0
          ) {
            updated +=
              result.affectedRows;
          } else {
            notFound++;
          }
        }

        await conn.commit();
      } catch (dbError) {
        await conn.rollback();
        throw dbError;
      } finally {
        conn.release();
      }

      return res.json({
        message:
          `${rows.length} billing rows processed`,

        totalRows:
          rows.length,

        updated,

        notFound
      });
    } catch (e) {
      console.error(
        "Billing upload error:",
        e
      );

      return res.status(400).json({
        message:
          "Billing upload failed",

        error:
          e.message
      });
    } finally {
      if (req.file?.path) {
        fs.unlink(
          req.file.path,
          () => {}
        );
      }
    }
  }
);

/* =====================================================
   PENDING VENDOR REPORT
===================================================== */

app.get(
  "/api/reports/pending-vendor",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT
            vendor_code AS vendorCode,
            vendor_name AS vendorName,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue,

            COALESCE(
              SUM(pending_quantity),
              0
            ) AS pendingQuantity

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            vendor_code,
            vendor_name

          HAVING
            SUM(pending_value) > 0

          ORDER BY
            pendingValue DESC
        `);

      res.json(rows);
    } catch (e) {
      console.error(
        "Pending vendor report error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   FILL RATE
===================================================== */

app.get(
  "/api/reports/fill-rate-vendor-month",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT

            DATE_FORMAT(so_date,'%b-%Y') AS month,

            vendor_code AS vendorCode,

            vendor_name AS vendorName,

            COALESCE(
              SUM(quantity_in_eaches),
              0
            ) AS soQty,

            COALESCE(
              SUM(billed_quantity),
              0
            ) AS billedQty,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            CASE
              WHEN
                COALESCE(
                  SUM(quantity_in_eaches),
                  0
                ) = 0

              THEN 0

              ELSE ROUND(
                COALESCE(
                  SUM(billed_quantity),
                  0
                )
                /
                SUM(quantity_in_eaches)
                * 100,
                2
              )
            END AS fillRate

          FROM rice_data

          WHERE
            valid_invalid = 'VALID'
            AND so_date IS NOT NULL

          GROUP BY
            YEAR(so_date),
            MONTH(so_date),

            vendor_code,
            vendor_name

          ORDER BY
            fillRate DESC,
            billedValue DESC
        `);

      res.json(rows);
    } catch (e) {
      console.error(
        "Fill rate report error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   TOP VENDOR
===================================================== */

app.get(
  "/api/reports/top-vendor",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT

            vendor_code AS vendorCode,

            vendor_name AS vendorName,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue,

            CASE
              WHEN
                COALESCE(
                  SUM(so_value),
                  0
                ) = 0

              THEN 0

              ELSE ROUND(
                SUM(billed_value)
                /
                SUM(so_value)
                * 100,
                2
              )
            END AS fillRate

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            vendor_code,
            vendor_name

          ORDER BY
            fillRate DESC,
            billedValue DESC

          LIMIT 50
        `);

      res.json(rows);
    } catch (e) {
      console.error(
        "Top vendor report error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   TOP ARTICLE
===================================================== */

app.get(
  "/api/reports/top-article",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT

            article_code AS articleCode,

            article_desc AS articleDesc,

            COALESCE(
              SUM(so_value),
              0
            ) AS soValue,

            COALESCE(
              SUM(billed_value),
              0
            ) AS billedValue,

            COALESCE(
              SUM(pending_value),
              0
            ) AS pendingValue,

            CASE
              WHEN
                COALESCE(
                  SUM(so_value),
                  0
                ) = 0

              THEN 0

              ELSE ROUND(
                SUM(billed_value)
                /
                SUM(so_value)
                * 100,
                2
              )
            END AS fillRate

          FROM rice_data

          WHERE valid_invalid = 'VALID'

          GROUP BY
            article_code,
            article_desc

          ORDER BY
            fillRate DESC,
            billedValue DESC

          LIMIT 50
        `);

      res.json(rows);
    } catch (e) {
      console.error(
        "Top article report error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   SAUDA - LIST
===================================================== */

app.get(
  "/api/sauda",
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(`
          SELECT *
          FROM sauda_data
          ORDER BY
            booking_date DESC,
            id DESC
        `);

      res.json(rows);
    } catch (e) {
      console.error(
        "Sauda list error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   SAUDA - SAVE
===================================================== */

app.post(
  "/api/sauda",
  async (req, res) => {
    const {
      bookingDate,
      vendorCode,
      vendorName,
      state,
      items = []
    } = req.body || {};

    const validItems =
      Array.isArray(items)
        ? items.filter(
            (item) =>
              clean(
                item?.articleCode
              ) ||
              num(
                item?.bookingQuantity
              ) > 0 ||
              num(
                item?.bookingRatePerBag
              ) > 0
          )
        : [];

    if (!bookingDate) {
      return res.status(400).json({
        message:
          "Booking date is required"
      });
    }

    const parsedBookingDate =
      dateOrNull(
        bookingDate
      );

    if (!parsedBookingDate) {
      return res.status(400).json({
        message:
          "Invalid booking date"
      });
    }

    if (!clean(vendorCode)) {
      return res.status(400).json({
        message:
          "Vendor Code is required"
      });
    }

    if (!clean(vendorName)) {
      return res.status(400).json({
        message:
          "Vendor Name is required"
      });
    }

    if (!validItems.length) {
      return res.status(400).json({
        message:
          "Add at least one article"
      });
    }

    for (const item of validItems) {
      if (
        !clean(
          item.articleCode
        )
      ) {
        return res.status(400).json({
          message:
            "Article Code is required for every article"
        });
      }

      if (
        num(
          item.bookingQuantity
        ) <= 0
      ) {
        return res.status(400).json({
          message:
            "Booking Quantity must be greater than 0"
        });
      }
    }

    const saudaId =
      "SAUDA-" +
      Date.now() +
      "-" +
      Math.floor(
        Math.random() * 1000
      );

    let conn;

    try {
      conn =
        await pool.getConnection();

      await conn.beginTransaction();

      for (
        const item of validItems
      ) {
        await conn.execute(
          `
          INSERT INTO sauda_data
          (
            sauda_id,
            booking_date,
            vendor_code,
            vendor_name,
            article_code,
            article_desc,
            state,
            booking_quantity_ea,
            booking_rate,
            booking_rate_per_bag
          )

          VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
          `,
          [
            saudaId,

            parsedBookingDate,

            clean(
              vendorCode
            ),

            clean(
              vendorName
            ),

            clean(
              item.articleCode
            ),

            clean(
              item.articleDesc
            ),

            clean(state),

            num(
              item.bookingQuantity
            ),

            num(
              item.bookingRate
            ),

            num(
              item.bookingRatePerBag
            )
          ]
        );
      }

      await conn.commit();

      return res.status(201).json({
        message:
          "Sauda saved successfully",

        saudaId,

        itemsSaved:
          validItems.length
      });
    } catch (e) {
      if (conn) {
        await conn.rollback();
      }

      console.error(
        "Sauda save error:",
        e
      );

      return res.status(500).json({
        message:
          "Sauda save failed",

        error:
          e.message,

        code:
          e.code || null
      });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
);

app.delete("/api/sauda/:saudaId", async (req,res)=>{
  try { const [r]=await pool.execute(`DELETE FROM sauda_data WHERE sauda_id=?`,[clean(req.params.saudaId)]); res.json({message:r.affectedRows?"Sauda deleted":"Sauda not found"}); }
  catch(e){res.status(500).json({message:e.message})}
});

app.put("/api/sauda/:saudaId", async (req,res)=>{
  const id=clean(req.params.saudaId), b=req.body||{}, items=Array.isArray(b.items)?b.items:[]; let conn;
  try{
    conn=await pool.getConnection(); await conn.beginTransaction();
    await conn.execute(`DELETE FROM sauda_data WHERE sauda_id=?`,[id]);
    for(const item of items){ if(!clean(item.articleCode)) continue; await conn.execute(`INSERT INTO sauda_data(sauda_id,booking_date,vendor_code,vendor_name,article_code,article_desc,state,booking_quantity_ea,booking_rate,booking_rate_per_bag) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,dateOrNull(b.bookingDate),clean(b.vendorCode),clean(b.vendorName),clean(item.articleCode),clean(item.articleDesc),clean(b.state),num(item.bookingQuantity),num(item.bookingRate),num(item.bookingRatePerBag)]); }
    await conn.commit(); res.json({message:"Sauda updated",saudaId:id});
  }catch(e){if(conn)await conn.rollback();res.status(500).json({message:e.message})}finally{if(conn)conn.release()}
});

/* =====================================================
   SAUDA REPORT
===================================================== */

app.get(
  "/api/sauda-report",
  async (req, res) => {
    try {
      const [saudas] =
        await pool.query(`
          SELECT *
          FROM sauda_data

          ORDER BY
            booking_date,
            id
        `);

      const [rice] =
        await pool.query(`
          SELECT
            id,
            vendor_code,
            vendor_name,
            article_code,
            basic_cost,
            billed_quantity,
            billed_date

          FROM rice_data

          WHERE
            valid_invalid = 'VALID'
            AND billed_quantity > 0

          ORDER BY
            billed_date,
            id
        `);

      const report = [];

      const used = new Map();

      for (const s of saudas) {
        const key =
          `${clean(
            s.vendor_code
          )}|` +
          `${clean(
            s.article_code
          )}|` +
          `${Number(
            s.booking_rate_per_bag ||
              0
          ).toFixed(2)}`;

        let supplied = 0;

        const start =
          new Date(
            `${formatMysqlDate(
              s.booking_date
            )}T00:00:00`
          );

        for (
          let i = 0;
          i < rice.length;
          i++
        ) {
          const r = rice[i];

          const rk =
            `${clean(
              r.vendor_code
            )}|` +
            `${clean(
              r.article_code
            )}|` +
            `${Number(
              r.basic_cost ||
                0
            ).toFixed(2)}`;

          if (
            rk !== key ||
            !r.billed_date
          ) {
            continue;
          }

          const billedDate =
            new Date(
              `${formatMysqlDate(
                r.billed_date
              )}T00:00:00`
            );

          if (
            Number.isNaN(
              billedDate.getTime()
            )
          ) {
            continue;
          }

          if (
            billedDate < start
          ) {
            continue;
          }

          const already =
            used.get(i) || 0;

          const available =
            Math.max(
              0,
              Number(
                r.billed_quantity ||
                  0
              ) - already
            );

          const required =
            Math.max(
              0,
              Number(
                s.booking_quantity_ea ||
                  0
              ) - supplied
            );

          const take =
            Math.min(
              available,
              required
            );

          if (take > 0) {
            used.set(
              i,
              already + take
            );

            supplied += take;
          }

          if (
            supplied >=
            Number(
              s.booking_quantity_ea ||
                0
            )
          ) {
            break;
          }
        }

        report.push({
          ...s,

          suppliedQuantity:
            supplied,

          pendingQuantity:
            Math.max(
              0,
              Number(
                s.booking_quantity_ea ||
                  0
              ) - supplied
            )
        });
      }

      res.json(report);
    } catch (e) {
      console.error(
        "Sauda report error:",
        e
      );

      res.status(500).json({
        message:
          e.message
      });
    }
  }
);

/* =====================================================
   MYSQL DATE FORMAT HELPER
===================================================== */

function formatMysqlDate(value) {
  if (!value) {
    return "";
  }

  if (
    typeof value ===
      "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(
      value
    )
  ) {
    return value.slice(
      0,
      10
    );
  }

  if (
    value instanceof Date
  ) {
    return formatDate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  return (
    dateOrNull(value) || ""
  );
}

/* =====================================================
   404
===================================================== */

app.use(
  (req, res) => {
    res.status(404).json({
      message:
        "API endpoint not found",

      path:
        req.originalUrl
    });
  }
);


/* =====================================================
   VENDOR INVOICE TRACKING
   All four stages are saved as one VITR record.
===================================================== */

app.get("/api/vendor-invoice-tracking", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.*, COUNT(i.id) AS item_count
      FROM vendor_invoice_tracking v
      LEFT JOIN vendor_invoice_items i ON i.vitr_no = v.vitr_no
      GROUP BY v.id
      ORDER BY v.id DESC
    `);
    for (const v of rows) {
      const [items] = await pool.query(`SELECT * FROM vendor_invoice_items WHERE vitr_no=? ORDER BY id`, [v.vitr_no]);
      v.items = items;
    }
    res.json(rows);
  } catch (e) { res.status(500).json({message:e.message}); }
});

app.post("/api/vendor-invoice-tracking", documentUpload.fields([
  {name:"vendorInvoicePdf", maxCount:1},
  {name:"rcplInvoicePdf", maxCount:1},
  {name:"podPdf", maxCount:1}
]), async (req, res) => {
  let conn;
  try {
    const b=req.body||{};
    const items=JSON.parse(b.items||"[]");
    if (!clean(b.invoiceDate) || !clean(b.vendorCode) || !clean(b.vendorName) || !clean(b.vendorInvoiceNumber)) return res.status(400).json({message:"Invoice Date, Vendor Invoice Number, Vendor Code and Vendor Name are required"});
    const vitrNo = b.vitrNo ? clean(b.vitrNo) : `VITR${Date.now()}${Math.floor(Math.random()*1000).toString().padStart(3,"0")}`;
    const files=req.files||{};
    const vendorInvoicePdf=await storeDocument(files.vendorInvoicePdf?.[0]);
    const rcplInvoicePdf=await storeDocument(files.rcplInvoicePdf?.[0]);
    const podPdf=await storeDocument(files.podPdf?.[0]);
    conn=await pool.getConnection(); await conn.beginTransaction();
    const [old]=await conn.execute(`SELECT id,vendor_invoice_pdf,rcpl_invoice_pdf,pod_pdf FROM vendor_invoice_tracking WHERE vitr_no=?`,[vitrNo]);
    await conn.execute(`
      INSERT INTO vendor_invoice_tracking
      (vitr_no,invoice_date,vendor_invoice_number,vendor_code,vendor_name,purchase_order,vehicle_number,vehicle_status,vendor_invoice_pdf,rcpl_invoice_pdf,pod_pdf,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE invoice_date=VALUES(invoice_date),vendor_invoice_number=VALUES(vendor_invoice_number),vendor_code=VALUES(vendor_code),vendor_name=VALUES(vendor_name),purchase_order=VALUES(purchase_order),vehicle_number=VALUES(vehicle_number),vehicle_status=VALUES(vehicle_status),vendor_invoice_pdf=COALESCE(VALUES(vendor_invoice_pdf),vendor_invoice_pdf),rcpl_invoice_pdf=COALESCE(VALUES(rcpl_invoice_pdf),rcpl_invoice_pdf),pod_pdf=COALESCE(VALUES(pod_pdf),pod_pdf),status=VALUES(status),updated_at=CURRENT_TIMESTAMP
    `,[dateOrNull(b.invoiceDate),clean(b.vendorInvoiceNumber),clean(b.vendorCode),clean(b.vendorName),clean(b.purchaseOrder),clean(b.vehicleNumber),clean(b.vehicleStatus),vendorInvoicePdf,rcplInvoicePdf,podPdf,clean(b.status)||"Pending"]);
    await conn.execute(`DELETE FROM vendor_invoice_items WHERE vitr_no=?`,[vitrNo]);
    for (const x of Array.isArray(items)?items:[]) {
      if (!clean(x.soNo) && !clean(x.articleCode)) continue;
      await conn.execute(`INSERT INTO vendor_invoice_items (vitr_no,so_no,rrl_po_no,article_code,article_desc,so_quantity,invoice_quantity,invoice_rate,rcpl_invoice_no) VALUES (?,?,?,?,?,?,?,?,?)`,[vitrNo,clean(x.soNo),clean(x.rrlPoNo),clean(x.articleCode),clean(x.articleDesc),num(x.soQuantity),num(x.invoiceQuantity),num(x.invoiceRate),clean(x.rcplInvoiceNo)]);
    }
    await conn.commit(); res.status(201).json({message:b.vitrNo?"Vendor Invoice Tracking updated":"Vendor Invoice Tracking saved",vitrNo});
  } catch(e){ if(conn) await conn.rollback(); res.status(500).json({message:"Vendor Invoice Tracking save failed",error:e.message}); }
  finally { if(conn) conn.release(); }
});

app.delete("/api/vendor-invoice-tracking/:vitrNo", async (req,res)=>{
  try { const [r]=await pool.execute(`DELETE FROM vendor_invoice_tracking WHERE vitr_no=?`,[clean(req.params.vitrNo)]); res.json({message:r.affectedRows?"Deleted":"Not found"}); }
  catch(e){res.status(500).json({message:e.message});}
});

/* =====================================================
   SALES DATA + RSO/RTV/CANCELLED CSV
===================================================== */
const salesHeaders=["SO DATE","SALES ORDER NO.","RRL PO.","BILLING DOC. NO.","BILLING DATE","BILLING MONTH","RCPL PO. NO.","CUSTOMER CODE","CUSTOMER NAME","PLANT CODE","PLANT NAME","ARTICLE CODE","ARTICLE DESC","PRODUCT FAMILY","PRODUCT CLASS","PRODUCT BRICK","BILLING QUANTITY","INV QUANT","GROSS VALUE","NET VALUE","TAX AMOUNT","COST IN DOCUMENT","GROSS SALES PER UNIT","NET SALES PER UNIT","COST PER UNIT","MARGIN PER UNIT","GROSS MARGIN","MARGIN %"];
const cancelHeaders=["SO DATE","SO NO.","RRL PO. NO.","RCPL PO. NO.","CUSTOMER CODE","PLANT CODE","PLANT NAME","ARTICLE CODE","ARTICLE DESC.","QUANTITY","RSO/RTV","RSO/RTV DATE"];

async function parseCsvFile(path, required) {
  const rows=[]; let headerError=null;
  await new Promise((resolve,reject)=>fs.createReadStream(path).pipe(csv({mapHeaders:({header})=>normalizeHeader(header)})).on("headers",hs=>{const got=hs.map(normalizeHeader);const missing=required.filter(x=>!got.includes(x));if(missing.length) headerError=new Error("Invalid header. Missing: "+missing.join(", "));}).on("data",r=>{if(!headerError)rows.push(normalizeRow(r));}).on("end",()=>headerError?reject(headerError):resolve()).on("error",reject));
  return rows;
}

async function genericUpload(req,res,kind){
  if(!req.file) return res.status(400).json({message:"CSV file required"});
  try{
    const required=kind==="sales"?salesHeaders:cancelHeaders; const rows=await parseCsvFile(req.file.path,required); if(!rows.length) return res.status(400).json({message:"CSV contains no data rows"});
    const conn=await pool.getConnection(); await conn.beginTransaction();
    if(kind==="sales"){
      for(const r of rows) await conn.execute(`INSERT INTO sales_data (so_date,sales_order_no,rrl_po,billing_doc_no,billing_date,billing_month,rcpl_po_no,customer_code,customer_name,plant_code,plant_name,article_code,article_desc,product_family,product_class,product_brick,billing_quantity,inv_quant,gross_value,net_value,tax_amount,cost_in_document,gross_sales_per_unit,net_sales_per_unit,cost_per_unit,margin_per_unit,gross_margin,margin_pct) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE billing_quantity=VALUES(billing_quantity),inv_quant=VALUES(inv_quant),gross_value=VALUES(gross_value),net_value=VALUES(net_value),tax_amount=VALUES(tax_amount),cost_in_document=VALUES(cost_in_document),gross_margin=VALUES(gross_margin),margin_pct=VALUES(margin_pct),billing_date=VALUES(billing_date),billing_month=VALUES(billing_month)`,[dateOrNull(r["SO DATE"]),clean(r["SALES ORDER NO."]),clean(r["RRL PO."]),clean(r["BILLING DOC. NO."]),dateOrNull(r["BILLING DATE"]),clean(r["BILLING MONTH"]),clean(r["RCPL PO. NO."]),clean(r["CUSTOMER CODE"]),clean(r["CUSTOMER NAME"]),clean(r["PLANT CODE"]),clean(r["PLANT NAME"]),clean(r["ARTICLE CODE"]),clean(r["ARTICLE DESC"]),clean(r["PRODUCT FAMILY"]),clean(r["PRODUCT CLASS"]),clean(r["PRODUCT BRICK"]),num(r["BILLING QUANTITY"]),num(r["INV QUANT"]),num(r["GROSS VALUE"]),num(r["NET VALUE"]),num(r["TAX AMOUNT"]),num(r["COST IN DOCUMENT"]),num(r["GROSS SALES PER UNIT"]),num(r["NET SALES PER UNIT"]),num(r["COST PER UNIT"]),num(r["MARGIN PER UNIT"]),num(r["GROSS MARGIN"]),num(r["MARGIN %"]) ]);
    } else {
      for(const r of rows) await conn.execute(`INSERT INTO cancelled_data (so_date,so_no,rrl_po_no,rcpl_po_no,customer_code,plant_code,plant_name,article_code,article_desc,quantity,rso_rtv,rso_rtv_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),rso_rtv=VALUES(rso_rtv),rso_rtv_date=VALUES(rso_rtv_date)`,[dateOrNull(r["SO DATE"]),clean(r["SO NO."]),clean(r["RRL PO. NO."]),clean(r["RCPL PO. NO."]),clean(r["CUSTOMER CODE"]),clean(r["PLANT CODE"]),clean(r["PLANT NAME"]),clean(r["ARTICLE CODE"]),clean(r["ARTICLE DESC."]),num(r["QUANTITY"]),clean(r["RSO/RTV"]),dateOrNull(r["RSO/RTV DATE"]) ]);
    }
    await conn.commit(); conn.release(); res.json({message:`${rows.length} rows processed`,totalRows:rows.length});
  }catch(e){res.status(400).json({message:"CSV upload failed",error:e.message});} finally {if(req.file?.path)fs.unlink(req.file.path,()=>{});}
}
app.post("/api/upload/sales",upload.single("file"),(req,res)=>genericUpload(req,res,"sales"));
app.post("/api/upload/cancelled",upload.single("file"),(req,res)=>genericUpload(req,res,"cancelled"));

/* =====================================================
   NEW REPORTS — SO MONTH ONLY
===================================================== */
app.get("/api/reports/monthly-purchase",async(req,res)=>{try{const [rows]=await pool.query(`SELECT DATE_FORMAT(so_date,'%b-%Y') month,COALESCE(NULLIF(crop_type,''),'UNKNOWN') cropType,COALESCE(SUM(quantity_in_eaches),0) purchaseQtyEA FROM rice_data WHERE valid_invalid='VALID' AND so_date IS NOT NULL GROUP BY YEAR(so_date),MONTH(so_date),COALESCE(NULLIF(crop_type,''),'UNKNOWN') ORDER BY YEAR(so_date),MONTH(so_date),cropType`);res.json(rows)}catch(e){res.status(500).json({message:e.message})}});
app.get("/api/reports/monthly-delivery",async(req,res)=>{try{const [rows]=await pool.query(`SELECT DATE_FORMAT(so_date,'%b-%Y') month,COALESCE(NULLIF(crop_type,''),'UNKNOWN') cropType,COALESCE(SUM(billed_quantity),0) deliveredQty FROM rice_data WHERE valid_invalid='VALID' AND so_date IS NOT NULL GROUP BY YEAR(so_date),MONTH(so_date),COALESCE(NULLIF(crop_type,''),'UNKNOWN') ORDER BY YEAR(so_date),MONTH(so_date),cropType`);res.json(rows)}catch(e){res.status(500).json({message:e.message})}});
app.get("/api/reports/fill-rate",async(req,res)=>{
  try{
    const [rows]=await pool.query(`
      SELECT month, vendorCode, vendorName, productBrick, soQty, billedQty,
        CASE WHEN soQty=0 THEN 0 ELSE ROUND(billedQty/soQty*100,2) END fillRate
      FROM (
        SELECT DATE_FORMAT(so_date,'%b-%Y') month,
          vendor_code vendorCode, vendor_name vendorName,
          'ALL' productBrick,
          SUM(quantity_in_eaches) soQty,
          SUM(billed_quantity) billedQty
        FROM rice_data
        WHERE valid_invalid='VALID' AND so_date IS NOT NULL
        GROUP BY YEAR(so_date),MONTH(so_date),vendor_code,vendor_name
        UNION ALL
        SELECT DATE_FORMAT(so_date,'%b-%Y') month,
          'ALL' vendorCode, 'ALL' vendorName,
          COALESCE(NULLIF(product_brick,''),'UNKNOWN') productBrick,
          SUM(quantity_in_eaches) soQty,
          SUM(billed_quantity) billedQty
        FROM rice_data
        WHERE valid_invalid='VALID' AND so_date IS NOT NULL
        GROUP BY YEAR(so_date),MONTH(so_date),COALESCE(NULLIF(product_brick,''),'UNKNOWN')
        UNION ALL
        SELECT DATE_FORMAT(so_date,'%b-%Y') month,
          'ALL' vendorCode, 'ALL' vendorName, 'ALL' productBrick,
          SUM(quantity_in_eaches) soQty,
          SUM(billed_quantity) billedQty
        FROM rice_data
        WHERE valid_invalid='VALID' AND so_date IS NOT NULL
        GROUP BY YEAR(so_date),MONTH(so_date)
      ) z
      ORDER BY STR_TO_DATE(CONCAT('01-',month),'%d-%b-%Y'), vendorName, productBrick
    `);
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message})}
});

app.get("/api/reports/top-performance",async(req,res)=>{try{const [vendors]=await pool.query(`SELECT DATE_FORMAT(so_date,'%b-%Y') month,vendor_code code,vendor_name name,'VENDOR' type,SUM(so_value) soValue,SUM(billed_value) billedValue FROM rice_data WHERE valid_invalid='VALID' AND so_date IS NOT NULL GROUP BY YEAR(so_date),MONTH(so_date),vendor_code,vendor_name ORDER BY YEAR(so_date),MONTH(so_date),billedValue DESC`);const [articles]=await pool.query(`SELECT DATE_FORMAT(so_date,'%b-%Y') month,article_code code,article_desc name,'ARTICLE' type,SUM(so_value) soValue,SUM(billed_value) billedValue FROM rice_data WHERE valid_invalid='VALID' AND so_date IS NOT NULL GROUP BY YEAR(so_date),MONTH(so_date),article_code,article_desc ORDER BY YEAR(so_date),MONTH(so_date),billedValue DESC`);const [customers]=await pool.query(`SELECT DATE_FORMAT(so_date,'%b-%Y') month,customer_code code,customer_name name,'CUSTOMER' type,SUM(so_value) soValue,SUM(billed_value) billedValue FROM rice_data WHERE valid_invalid='VALID' AND so_date IS NOT NULL GROUP BY YEAR(so_date),MONTH(so_date),customer_code,customer_name ORDER BY YEAR(so_date),MONTH(so_date),billedValue DESC`);res.json({vendors,articles,customers})}catch(e){res.status(500).json({message:e.message})}});

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "GLOBAL ERROR:",
      err
    );

    res.status(500).json({
      message:
        "Internal server error",

      error:
        err.message
    });
  }
);

/* =====================================================
   SERVER
===================================================== */

const PORT =
  Number(
    process.env.PORT
  ) || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      `RICE PORTAL backend running on http://localhost:${PORT}`
    );

    try {
      await pool.query(
        "SELECT 1"
      );

      console.log(
        "MySQL database connected successfully"
      );

      /*
         IMPORTANT:
         No automatic duplicate
         protection is enabled here.
      */
    } catch (e) {
      console.error(
        "MySQL connection/setup error:",
        e.message
      );
    }
  }
);





