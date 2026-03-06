require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const Vehicle = require("../models/Vehicle");

const CSV_PATH = path.join(process.cwd(), "Euro_6_latest.csv");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    if (!fs.existsSync(CSV_PATH)) {
      console.error("CSV file not found at: " + CSV_PATH);
      process.exit(1);
    }

    const vehicles = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on("data", (row) => {
          const manufacturer = (row["Manufacturer"] || "").trim();
          const model = (row["Model"] || "").trim();

          if (!manufacturer || !model) return;

          vehicles.push({
            manufacturer,
            model,
            description: (row["Description"] || "").trim(),
            fuelType: (row["Fuel Type"] || "").trim(),
            engineSize: parseFloat(row["Engine Capacity"]) || null,
            co2: parseFloat(row["WLTP CO2"]) || null,
            transmission: (row["Transmission"] || "").trim(),
            year: null,
          });
        })
        .on("end", resolve)
        .on("error", reject);
    });

    console.log("Parsed " + vehicles.length + " vehicles from CSV");

    await Vehicle.deleteMany({});
    console.log("Cleared existing vehicles");

    const batchSize = 500;
    for (let i = 0; i < vehicles.length; i += batchSize) {
      const batch = vehicles.slice(i, i + batchSize);
      await Vehicle.insertMany(batch, { ordered: false });
      console.log(
        "Inserted batch " +
          (Math.floor(i / batchSize) + 1) +
          " (" +
          Math.min(i + batchSize, vehicles.length) +
          "/" +
          vehicles.length +
          ")",
      );
    }

    console.log("Successfully seeded " + vehicles.length + " vehicles!");
    await mongoose.disconnect();
  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  }
}

seed();
