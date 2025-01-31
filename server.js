const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid'); // For generating session IDs
require('dotenv').config();

// Validate required environment variables
if (!process.env.PORT) {
  console.error('Error: PORT is required in the .env file.');
  process.exit(1); // Exit the application if PORT is missing
}

const app = express();
const PORT = process.env.PORT; // Use the PORT from .env
const UPLOAD_DIR = '/var/html/uploads';

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// List of allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Videos
  'video/mp4',
  'video/mpeg',
  'video/ogg',
  'video/webm',
  'video/x-msvideo',

  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',

  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/gzip',
];

// Increase payload size limit to 20GB
app.use(express.json({ limit: '20gb' }));
app.use(express.urlencoded({ limit: '20gb', extended: true }));

// Enable file uploads
app.use(fileUpload({
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB limit
  abortOnLimit: true,
  responseOnLimit: 'File size exceeds the 20GB limit.',
}));

// Serve static files (e.g., index.html)
app.use(express.static('public'));

// Store session IDs and their upload directories
const sessions = {};

// Generate a session ID and create a directory for it
app.post('/start-session', (req, res) => {
  const sessionId = uuidv4();
  const sessionDir = path.join(UPLOAD_DIR, sessionId);

  // Create the session directory
  fs.mkdirSync(sessionDir, { recursive: true });

  // Store the session
  sessions[sessionId] = { dir: sessionDir };

  res.json({ sessionId });
});

// File upload endpoint
app.post('/upload', (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ success: false, message: 'No files were uploaded.' });
  }

  const file = req.files.file;
  const sessionId = req.headers['x-session-id'];

  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ success: false, message: 'Invalid session ID.' });
  }

  const sessionDir = sessions[sessionId].dir;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return res.status(400).json({ success: false, message: 'File type not allowed. Only images, videos, documents, and archives are accepted.' });
  }

  const filePath = path.join(sessionDir, file.name);

  // Log the file upload attempt
  console.log(`Attempting to upload file: ${file.name}, size: ${file.size} bytes, type: ${file.mimetype}`);

  // Save the file to the session directory
  file.mv(filePath, (err) => {
    if (err) {
      console.error('File upload failed:', err);
      return res.status(500).json({ success: false, message: err.message });
    }

    console.log(`File uploaded successfully: ${file.name}`);

    // Scan the file for viruses using ClamAV (if installed)
    scanFileForViruses(filePath)
      .then((isClean) => {
        if (isClean === false) {
          // Delete the infected file
          fs.unlinkSync(filePath);
          console.log(`Infected file deleted: ${file.name}`);
          return res.status(400).json({ success: false, message: 'File is infected and has been deleted.' });
        }

        console.log(`File is clean: ${file.name}`);

        // Send email notification (if email credentials are provided)
        if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_TO) {
          sendEmail(`File ${file.name} has been uploaded.`)
            .then(() => res.json({ success: true }))
            .catch((emailErr) => {
              console.error('Email notification failed:', emailErr);
              res.json({ success: true }); // Skip email error notification
            });
        } else {
          // Skip email notification
          res.json({ success: true });
        }
      })
      .catch((scanErr) => {
        console.error('Virus scan skipped or failed:', scanErr);
        // Skip virus scanning and proceed with email notification
        if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_TO) {
          sendEmail(`File ${file.name} has been uploaded.`)
            .then(() => res.json({ success: true }))
            .catch((emailErr) => {
              console.error('Email notification failed:', emailErr);
              res.json({ success: true }); // Skip email error notification
            });
        } else {
          // Skip email notification
          res.json({ success: true });
        }
      });
  });
});

// Virus scanning function
function scanFileForViruses(filePath) {
  return new Promise((resolve, reject) => {
    // Check for clamscan in multiple locations
    const clamscanPaths = ['clamscan', '/usr/bin/clamscan'];

    const checkClamscan = (index) => {
      if (index >= clamscanPaths.length) {
        // ClamAV is not installed
        console.log('ClamAV is not installed. Skipping virus scan.');
        resolve(null); // Skip scanning
        return;
      }

      const clamscanPath = clamscanPaths[index];

      exec(`${clamscanPath} --version`, (error) => {
        if (error) {
          // ClamAV not found in this path, try the next one
          checkClamscan(index + 1);
        } else {
          // ClamAV is installed, scan the file
          exec(`${clamscanPath} ${filePath}`, (error, stdout, stderr) => {
            if (error) {
              // ClamAV found a virus
              if (error.code === 1) {
                resolve(false); // File is infected
              } else {
                reject(new Error(`ClamAV scan failed: ${stderr}`));
              }
            } else {
              resolve(true); // File is clean
            }
          });
        }
      });
    };

    // Start checking for clamscan
    checkClamscan(0);
  });
}

// Email sending function (optional)
function sendEmail(message) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true', // Convert to boolean
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject: 'File Upload Notification',
    text: message,
  };

  return transporter.sendMail(mailOptions);
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});