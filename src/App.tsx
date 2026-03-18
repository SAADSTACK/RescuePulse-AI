/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  AlertCircle, 
  MapPin, 
  Activity, 
  Shield, 
  Navigation, 
  Phone, 
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
  UserPlus,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, setDoc, doc, getDocs } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Responder {
  id: string;
  name: string;
  role: string;
  lat: number;
  lon: number;
}

interface EmergencyResponse {
  status: string;
  radius_searched: number;
  responders_found: Responder[];
  message: string;
}

export default function App() {
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [response, setResponse] = useState<EmergencyResponse | null>(null);
  const [guidance, setGuidance] = useState<string[]>([]);
  const [isLoadingGuidance, setIsLoadingGuidance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyType, setEmergencyType] = useState<string>("Medical Emergency");
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([]);

  // Initialize Auth and Location
  useEffect(() => {
    // Auth
    signInAnonymously(auth).then(() => {
      setIsAuthReady(true);
    }).catch(err => {
      console.error("Auth Error:", err);
      setError("Failed to initialize secure session.");
    });

    // Location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (err) => {
          setError("Location access denied. Please enable GPS for RescuePulse.");
        }
      );
    }
  }, []);

  // Real-time listener for emergencies (Simulation)
  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, "emergencies"), where("status", "==", "active"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveEmergencies(ems);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const triggerEmergency = async () => {
    if (!location) {
      setError("Waiting for location data...");
      return;
    }

    setIsTriggering(true);
    setError(null);
    setResponse(null);

    try {
      // 1. Log to Firestore (Real-time DB Simulation)
      try {
        await addDoc(collection(db, "emergencies"), {
          victim_lat: location.lat,
          victim_lon: location.lon,
          type: emergencyType,
          status: "active",
          timestamp: new Date().toISOString()
        });
      } catch (fsErr) {
        console.error("Firestore Error:", fsErr);
        // We continue even if Firestore fails, as the API is the primary trigger
      }

      // 2. Call Backend for Dispatch Logic
      const res = await fetch('/api/trigger-emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          victim_lat: location.lat,
          victim_lon: location.lon
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
      
      // 3. Get AI Guidance
      getAIGuidance(emergencyType);
    } catch (err: any) {
      console.error("Trigger Error:", err);
      setError(err.message || "Failed to connect to emergency server.");
    } finally {
      setIsTriggering(false);
    }
  };

  const seedResponders = async () => {
    if (!location) return;
    try {
      const mockResponders = [
        { name: "Dr. Sarah", lat: location.lat + 0.001, lon: location.lon + 0.001, role: "Doctor", is_available: true },
        { name: "Paramedic John", lat: location.lat - 0.001, lon: location.lon - 0.001, role: "Paramedic", is_available: true },
      ];

      for (const r of mockResponders) {
        await addDoc(collection(db, "responders"), r);
      }
      alert("Mock responders seeded near your location!");
    } catch (err) {
      console.error("Seed Error:", err);
    }
  };

  const getAIGuidance = async (condition: string) => {
    setIsLoadingGuidance(true);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `You are a life-saving AI assistant for RescuePulse. 
      The user is facing a: ${condition}.
      Provide exactly 3 short, bulleted life-saving steps (max 15 words each).
      Focus on immediate actions before responders arrive.
      Format: Return only the 3 bullets, no intro or outro.`;

      const result = await genAI.models.generateContent({
        model: model,
        contents: prompt,
      });

      const text = result.text || "";
      const steps = text.split('\n').filter(line => line.trim().length > 0).slice(0, 3);
      setGuidance(steps);
    } catch (err) {
      console.error("Gemini Error:", err);
      setGuidance(["Stay calm and wait for help.", "Ensure the area is safe.", "Call local emergency services."]);
    } finally {
      setIsLoadingGuidance(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-mono selection:bg-orange-500 selection:text-black">
      {/* Hardware UI Overlay */}
      <div className="fixed inset-0 pointer-events-none border-[12px] border-[#1A1A1A] z-50">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#1A1A1A] px-6 py-2 rounded-full border border-white/10 shadow-2xl">
          <Activity className="w-4 h-4 text-orange-500 animate-pulse" />
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold text-orange-500">RescuePulse AI v1.0</span>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
        </div>
      </div>

      <main className="max-w-4xl mx-auto pt-24 pb-12 px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Left Column: Status & Trigger */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-[#151619] border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[60px]" />
              
              <h1 className="text-3xl font-bold tracking-tighter mb-2">EMERGENCY<br/>TRIGGER</h1>
              <p className="text-xs text-zinc-500 mb-8 uppercase tracking-widest">Satellite Link: {location ? "ACTIVE" : "SEARCHING..."}</p>

              <div className="space-y-4 mb-8">
                <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Emergency Type</label>
                <select 
                  value={emergencyType}
                  onChange={(e) => setEmergencyType(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer"
                >
                  <option>Medical Emergency</option>
                  <option>Cardiac Arrest</option>
                  <option>Severe Bleeding</option>
                  <option>Fire / Smoke</option>
                  <option>Accident / Trauma</option>
                </select>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={triggerEmergency}
                disabled={isTriggering || !location}
                className={`w-full py-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-500 shadow-2xl relative group ${
                  isTriggering 
                    ? 'bg-zinc-800 cursor-not-allowed' 
                    : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                {isTriggering ? (
                  <Loader2 className="w-12 h-12 animate-spin text-white" />
                ) : (
                  <AlertCircle className="w-12 h-12 text-white" />
                )}
                <span className="text-xl font-black tracking-tighter uppercase">
                  {isTriggering ? "Broadcasting..." : "SOS TRIGGER"}
                </span>
              </motion.button>

              {error && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-xs">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Simulation Controls */}
            <div className="bg-[#151619] border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Simulation Tools</span>
                <Radio className="w-4 h-4 text-zinc-500" />
              </div>
              <button 
                onClick={seedResponders}
                className="w-full py-3 bg-zinc-800 border border-white/10 rounded-xl text-[10px] uppercase tracking-widest font-bold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-3 h-3" />
                Seed Responders Nearby
              </button>
            </div>

            <div className="bg-[#151619] border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Location Data</span>
                <MapPin className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="block text-[8px] text-zinc-600 uppercase mb-1">Latitude</span>
                  <span className="text-xs font-mono">{location?.lat.toFixed(6) || "---"}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="block text-[8px] text-zinc-600 uppercase mb-1">Longitude</span>
                  <span className="text-xs font-mono">{location?.lon.toFixed(6) || "---"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Guidance & Responders */}
          <div className="md:col-span-7 space-y-6">
            
            {/* AI Guidance Section */}
            <div className="bg-[#151619] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-orange-600/10 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-orange-500" />
                  <h2 className="text-sm font-bold tracking-tight uppercase">AI First-Aid Guidance</h2>
                </div>
                {isLoadingGuidance && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
              </div>
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {guidance.length > 0 ? (
                    <motion.div 
                      key="guidance"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {guidance.map((step, i) => (
                        <div key={i} className="flex gap-4 items-start group">
                          <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-bold text-orange-500 shrink-0 border border-orange-500/30 group-hover:bg-orange-500 group-hover:text-black transition-colors">
                            0{i + 1}
                          </div>
                          <p className="text-sm text-zinc-300 leading-relaxed pt-0.5">{step.replace(/^[•\d\.\s]+/, '')}</p>
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600 text-center">
                      <Info className="w-8 h-8 mb-3 opacity-20" />
                      <p className="text-xs uppercase tracking-widest">Select emergency type and trigger SOS for AI guidance</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Responders Section */}
            <div className="bg-[#151619] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-zinc-800/50 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Navigation className="w-5 h-5 text-zinc-400" />
                  <h2 className="text-sm font-bold tracking-tight uppercase">Nearby Responders</h2>
                </div>
                {response && (
                  <span className="text-[10px] bg-orange-500/20 text-orange-500 px-2 py-1 rounded border border-orange-500/20">
                    {response.radius_searched}m Radius
                  </span>
                )}
              </div>
              <div className="p-6 min-h-[200px]">
                {!response ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600 text-center">
                    <Activity className="w-8 h-8 mb-3 opacity-20" />
                    <p className="text-xs uppercase tracking-widest">Waiting for SOS broadcast...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {response.responders_found.length > 0 ? (
                      response.responders_found.map((responder) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={responder.id} 
                          className="bg-black/30 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10 group-hover:bg-orange-500 transition-colors">
                              <Activity className="w-5 h-5 text-zinc-400 group-hover:text-black" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold">{responder.name}</h3>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{responder.role}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-green-500 font-bold uppercase">En Route</span>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-red-400 mb-2 font-bold uppercase">No Responders in Vicinity</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Escalating to Zurich Emergency Services (144)</p>
                        <button className="mt-6 w-full py-4 bg-red-600/20 border border-red-600/30 rounded-xl text-red-500 text-xs font-bold uppercase flex items-center justify-center gap-2 hover:bg-red-600/30 transition-colors">
                          <Phone className="w-4 h-4" />
                          Direct Call 144
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A] border-t border-white/5 py-3 px-8 flex items-center justify-between z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[8px] uppercase tracking-widest text-zinc-500">System Normal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span className="text-[8px] uppercase tracking-widest text-zinc-500">GPS Linked</span>
          </div>
          {activeEmergencies.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-[8px] uppercase tracking-widest text-red-500 font-bold">{activeEmergencies.length} ACTIVE SOS</span>
            </div>
          )}
        </div>
        <div className="text-[8px] uppercase tracking-widest text-zinc-600">
          Zurich Hackathon 2026 // RescuePulse AI
        </div>
      </footer>
    </div>
  );
}
