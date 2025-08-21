// src/controllers/newsletterController.ts
import { RequestHandler } from "express";
import nodemailer from "nodemailer";
import Subscriber from "../model/Subscriber.model.js";

/**
 * POST /api/v1/subscribe
 * Body: { email: string }
 *
 * This controller:
 *  1) validates the email
 *  2) upserts the subscriber into MongoDB
 *  3) sends a thank-you email via nodemailer (transport configured via env vars)
 *
 * Make sure SMTP env vars are set:
 *  - SMTP_HOST
 *  - SMTP_PORT
 *  - SMTP_USER
 *  - SMTP_PASS
 *  - EMAIL_FROM (optional)
 */
export const SubscribeController: RequestHandler = async (req, res) => {
  try {
    const email = (req.body?.email ?? "").toString().trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ ok: false, error: "Invalid email" });
      return;
    }

    // Upsert subscriber (create if missing)
    const doc = await Subscriber.findOneAndUpdate(
      { email },
      { $setOnInsert: { createdAt: new Date() }, $set: {} as any },
      { upsert: true, new: true }
    ).exec();

    // Prepare nodemailer transporter using ENV vars
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    let emailSent = false;
    let emailError: any = null;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn("SMTP config incomplete; skipping sending email. Set SMTP_HOST/SMTP_USER/SMTP_PASS in environment.");
    } else {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const from = process.env.EMAIL_FROM ?? `no-reply@${process.env.MAIL_DOMAIN ?? "web3checker.com"}`;
        const subject = "Thanks for subscribing!";
        const text = `Thanks for subscribing to our newsletter — we'll keep you updated.`;
        const html = `
          <div style="font-family: system-ui, -apple-system, Roboto, 'Segoe UI', Arial; color:#0f172a;">
            <h2 style="margin-bottom:8px;">Thanks for subscribing 👋</h2>
            <p style="margin:0 0 12px 0;">We're excited to keep you updated on product news and Web3 monitoring innovations.</p>
            <p style="font-size:13px;color:#475569;margin:0;">If you didn't sign up, you can safely ignore this message.</p>
          </div>
        `;

        await transporter.sendMail({
          from,
          to: email,
          subject,
          text,
          html,
        });

        emailSent = true;
      } catch (err) {
        emailError = err;
        console.warn("sendThankYouEmail failed:", err);
      }
    }

    // send response (do not `return res...`, just send and return)
    res.json({
      ok: true,
      emailSent,
      subscriber: { email: doc.email, createdAt: doc.createdAt },
      emailError: emailError ? String(emailError) : undefined,
    });
    return;
  } catch (err) {
    console.error("SubscribeController error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
    return;
  }
};
