import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Mock responders list
const responders = [
  { id: "1", name: "Dr. Sarah", lat: 47.3769, lon: 8.5417, role: "Doctor" }, // Zurich HB
  { id: "2", name: "Paramedic John", lat: 47.3780, lon: 8.5400, role: "Paramedic" },
  { id: "3", name: "Nurse Anna", lat: 47.3750, lon: 8.5450, role: "Nurse" },
  { id: "4", name: "First Responder Mike", lat: 47.3800, lon: 8.5350, role: "Volunteer" },
];

// Haversine formula for distance calculation
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

// API Route: Trigger Emergency
app.post("/api/trigger-emergency", (req, res) => {
  console.log("Emergency Triggered:", req.body);
  const { victim_lat, victim_lon } = req.body;

  if (!victim_lat || !victim_lon) {
    return res.status(400).json({ error: "Missing coordinates" });
  }

  const findResponders = (radius: number) => {
    return responders.filter(r => {
      const dist = getDistance(victim_lat, victim_lon, r.lat, r.lon);
      return dist <= radius;
    });
  };

  // Escalation logic: 300m -> 400m -> 600m
  let radius = 300;
  let nearbyResponders = findResponders(radius);

  if (nearbyResponders.length === 0) {
    radius = 400;
    nearbyResponders = findResponders(radius);
  }

  if (nearbyResponders.length === 0) {
    radius = 600;
    nearbyResponders = findResponders(radius);
  }

  res.json({
    status: "success",
    radius_searched: radius,
    responders_found: nearbyResponders,
    message: nearbyResponders.length > 0 
      ? `Found ${nearbyResponders.length} responders within ${radius}m.`
      : "No responders found in immediate vicinity. Escalating to emergency services."
  });
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupVite();

// Export for Vercel
export default app;

// Only listen if not in a serverless environment
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
