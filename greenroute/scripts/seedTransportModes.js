require("dotenv").config();
const mongoose = require("mongoose");
const TransportMode = require("../models/TransportMode");

const modes = [
  {
    name: "Car (Petrol)",
    emissionFactor: 171,
    icon: "🚗",
    usesGradient: true,
    description: "Average petrol car",
  },
  {
    name: "Car (Diesel)",
    emissionFactor: 155,
    icon: "🚙",
    usesGradient: true,
    description: "Average diesel car",
  },
  {
    name: "Car (Hybrid)",
    emissionFactor: 100,
    icon: "🔋",
    usesGradient: true,
    description: "Hybrid electric vehicle",
  },
  {
    name: "Car (Electric)",
    emissionFactor: 50,
    icon: "⚡",
    usesGradient: true,
    description: "Battery electric vehicle (tailpipe)",
  },
  {
    name: "Bus",
    emissionFactor: 82,
    icon: "🚌",
    usesGradient: true,
    description: "Average local bus per passenger",
  },
  {
    name: "Train",
    emissionFactor: 41,
    icon: "🚆",
    usesGradient: false,
    description: "National rail per passenger",
  },
  {
    name: "Tram / Light Rail",
    emissionFactor: 35,
    icon: "🚊",
    usesGradient: false,
    description: "Urban light rail per passenger",
  },
  {
    name: "Metro",
    emissionFactor: 35,
    icon: "🚇",
    usesGradient: false,
    description: "Metro per passenger",
  },
  {
    name: "Motorcycle",
    emissionFactor: 113,
    icon: "🏍️",
    usesGradient: true,
    description: "Average motorcycle",
  },
  {
    name: "Bicycle",
    emissionFactor: 0,
    icon: "🚲",
    usesGradient: false,
    description: "Zero direct emissions",
  },
  {
    name: "Walking",
    emissionFactor: 0,
    icon: "🚶",
    usesGradient: false,
    description: "Zero direct emissions",
  },
  {
    name: "E-Scooter",
    emissionFactor: 12,
    icon: "🛴",
    usesGradient: true,
    description: "Shared electric scooter (lifecycle)",
  },
  {
    name: "Taxi / Rideshare",
    emissionFactor: 210,
    icon: "🚕",
    usesGradient: true,
    description: "Average taxi per passenger",
  },
  {
    name: "Van",
    emissionFactor: 240,
    icon: "🚐",
    usesGradient: true,
    description: "Average light goods van",
  },
  {
    name: "Ferry",
    emissionFactor: 115,
    icon: "⛴️",
    usesGradient: false,
    description: "Ferry per passenger",
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    await TransportMode.deleteMany({});
    console.log("Cleared existing transport modes");

    await TransportMode.insertMany(modes);
    console.log("Seeded " + modes.length + " transport modes");

    await mongoose.disconnect();
    console.log("Done!");
  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  }
}

seed();
