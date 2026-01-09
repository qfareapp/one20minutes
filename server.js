const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.warn("MONGODB_URI is not set. Submissions will not be saved.");
}

mongoose
  .connect(mongoUri || "", { dbName: process.env.MONGODB_DB || "one20minutes" })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

const submissionSchema = new mongoose.Schema({
  created_at: { type: String, required: true },
  full_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  company: { type: String },
  build_type: { type: String },
  project_type: { type: String },
  industry: { type: String },
  platform_required: { type: [String], default: [] },
  timeline: { type: String },
  startup_stage: { type: String },
  budget: { type: String },
  message: { type: String },
  mvp_validation: { type: String },
  mvp_purpose: { type: [String], default: [] },
  discussion_mode: { type: [String], default: [] },
  referral_source: { type: String },
  attachments: { type: Array, default: [] }
});

const Submission = mongoose.model("Submission", submissionSchema);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true
  })
);

app.use(express.static(__dirname));

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

app.post("/api/contact", upload.array("attachments", 5), async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      company,
      build_type,
      project_type,
      industry,
      timeline,
      startup_stage,
      budget,
      message,
      mvp_validation,
      referral_source
    } = req.body;

    const platform_required = normalizeArray(req.body["platform_required[]"] || req.body.platform_required);
    const mvp_purpose = normalizeArray(req.body["mvp_purpose[]"] || req.body.mvp_purpose);
    const discussion_mode = normalizeArray(req.body["discussion_mode[]"] || req.body.discussion_mode);

    if (!full_name || !email || !phone) {
      return res.status(400).send("Missing required fields");
    }

    const attachments = (req.files || []).map((file) => ({
      originalname: file.originalname,
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size
    }));

    const createdAt = new Date().toISOString();

    if (mongoUri) {
      await Submission.create({
        created_at: createdAt,
        full_name,
        email,
        phone,
        company: company || "",
        build_type: build_type || "",
        project_type: project_type || "",
        industry: industry || "",
        platform_required,
        timeline: timeline || "",
        startup_stage: startup_stage || "",
        budget: budget || "",
        message: message || "",
        mvp_validation: mvp_validation || "",
        mvp_purpose,
        discussion_mode,
        referral_source: referral_source || "",
        attachments
      });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const mailTo = process.env.TO_EMAIL;
    const mailFrom = process.env.FROM_EMAIL;

    if (!smtpHost || !smtpUser || !smtpPass || !mailTo || !mailFrom) {
      console.warn("Email not sent: SMTP settings are missing.");
      return res.status(200).send("OK");
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const emailBody = [
      `Full Name: ${full_name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Company: ${company || "-"}`,
      `Build Type: ${build_type || "-"}`,
      `Project Type: ${project_type || "-"}`,
      `Industry: ${industry || "-"}`,
      `Platform Required: ${platform_required.join(", ") || "-"}`,
      `Timeline: ${timeline || "-"}`,
      `Startup Stage: ${startup_stage || "-"}`,
      `Budget: ${budget || "-"}`,
      `MVP Validation: ${mvp_validation || "-"}`,
      `MVP Purpose: ${mvp_purpose.join(", ") || "-"}`,
      `Discussion Mode: ${discussion_mode.join(", ") || "-"}`,
      `Referral Source: ${referral_source || "-"}`,
      "",
      "Message:",
      message || "-"
    ].join("\n");

    const mailInfo = await transporter.sendMail({
      from: mailFrom,
      to: mailTo,
      replyTo: email,
      subject: `New Inquiry - ${full_name}`,
      text: emailBody,
      attachments: attachments.map((file) => ({
        filename: file.originalname,
        path: file.path
      }))
    });

    console.log("Email sent:", {
      messageId: mailInfo.messageId,
      accepted: mailInfo.accepted,
      rejected: mailInfo.rejected
    });

    return res.status(200).send("OK");
  } catch (error) {
    return res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
