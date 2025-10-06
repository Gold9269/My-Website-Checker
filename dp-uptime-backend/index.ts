import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import websiteRoutes from './routes/index.js';

// models imported for side-effects (registering mongoose models)
import './model/WebsiteTick.model.js';
import './model/Website.model.js';

dotenv.config();
connectDB();

const app = express();

// Recreate __dirname and __filename in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Example: scanRoutes helper (safe now)
function scanRoutesForFullUrls(routesDir = path.join(__dirname, "routes")) {
  console.log("Scanning routes in:", routesDir);
  // add logic if needed
}

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use('/api/v1', websiteRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  scanRoutesForFullUrls(); // optional
});
