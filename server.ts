import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-faculty-portal-key";

app.use(express.json());

// API Routes
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { registrationNumber } = req.body;
  const token = jwt.sign({ registrationNumber }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

app.post("/api/email/confirm", async (req: Request, res: Response) => {
  const { studentEmail, studentName, selections } = req.body;

  const emailUser = process.env.EMAIL_USER?.trim();
  let emailPass = process.env.EMAIL_PASS;

  if (emailPass) {
    emailPass = emailPass.replace(/\s/g, "");
  }

  const isPlaceholder = (val: string | undefined) => 
    !val || val.includes("YOUR_EMAIL") || val.includes("YOUR_APP_PASSWORD");

  if (isPlaceholder(emailUser) || isPlaceholder(emailPass)) {
    console.log("Email credentials are not configured. Mocking email send.");
    return res.json({ 
      success: true, 
      message: "Email mocked (credentials not configured)",
      debug: {
        user: emailUser || "missing",
        passLength: emailPass ? emailPass.length : 0,
        tip: "Please set EMAIL_USER and EMAIL_PASS in the AI Studio Secrets panel."
      }
    });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const selectionList = Object.entries(selections)
    .map(([subject, faculty]) => `<li><b>${subject}:</b> ${faculty}</li>`)
    .join("");

  const mailOptions = {
    from: emailUser,
    to: studentEmail,
    bcc: emailUser,
    subject: "Faculty Selection Confirmation",
    html: `
      <h1>Faculty Selection Portal</h1>
      <p>Hello ${studentName},</p>
      <p>Your faculty selections have been successfully submitted:</p>
      <ul>${selectionList}</ul>
      <p>This is a permanent selection and cannot be modified.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email sent" });
  } catch (error: any) {
    console.error("Email error details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: "Failed to send email",
      details: error.message,
      code: error.code
    });
  }
});

// Setup Frontend
async function setupFrontend() {
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(distPath);

  if (isProd && hasDist) {
    console.log("Serving static files from dist...");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
}

// Export for Vercel
export default app;

// Start server if not on Vercel
if (!process.env.VERCEL) {
  setupFrontend().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}