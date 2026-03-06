// controllers/routeController.js
// Server-side proxy for OpenRouteService — keeps API key hidden
// Includes in-memory caching to reduce API calls and avoid rate limits

// ── Simple in-memory cache ──────────────────────────────────
// Caches geocode, autocomplete, direction, and reverse geocode results
// for 10 minutes. Massively reduces ORS API usage.
var cache = {};
var CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cacheGet(key) {
  var entry = cache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  if (entry) delete cache[key];
  return null;
}

function cacheSet(key, data) {
  cache[key] = { data: data, time: Date.now() };
  // Prevent memory leak: cap at 500 entries
  var keys = Object.keys(cache);
  if (keys.length > 500) delete cache[keys[0]];
}

// ── GET /api/route-info?origin=...&destination=... ──────────
// Geocodes both locations, fetches directions with elevation,
// calculates gradient modifier, returns all data as JSON
exports.getRouteInfo = async (req, res) => {
  try {
    var origin = (req.query.origin || "").trim();
    var destination = (req.query.destination || "").trim();

    if (!origin || !destination) {
      return res
        .status(400)
        .json({ error: "Origin and destination are required" });
    }

    var apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "ORS API key not configured on server" });
    }

    // Geocode both locations in parallel
    var results = await Promise.all([
      geocode(origin, apiKey),
      geocode(destination, apiKey),
    ]);

    var originCoords = results[0];
    var destCoords = results[1];

    if (!originCoords) {
      return res
        .status(404)
        .json({ error: 'Could not find location: "' + origin + '"' });
    }
    if (!destCoords) {
      return res
        .status(404)
        .json({ error: 'Could not find location: "' + destination + '"' });
    }

    // Get directions with elevation + steepness
    var routeData = await getDirectionsWithElevation(
      originCoords,
      destCoords,
      apiKey,
    );
    if (!routeData) {
      return res
        .status(500)
        .json({ error: "Could not calculate route between those locations" });
    }

    // Calculate gradient modifier from steepness data
    var gradientInfo = calculateGradient(routeData);

    res.json({
      distance: routeData.distance,
      duration: routeData.duration,
      elevationGain: routeData.ascent,
      elevationLoss: routeData.descent,
      gradient: gradientInfo.avgGradient,
      gradientModifier: gradientInfo.modifier,
      originCoords: originCoords,
      destCoords: destCoords,
    });
  } catch (err) {
    console.error("Route info error:", err.message);
    res.status(500).json({ error: "Failed to fetch route information" });
  }
};

// ── GET /api/autocomplete?text=... ──────────────────────────
// Pelias autocomplete — returns location suggestions as the user types
// Results are cached for 10 minutes to avoid burning API quota
exports.autocomplete = async (req, res) => {
  try {
    var text = (req.query.text || "").trim();

    // Need at least 3 characters for meaningful suggestions
    if (text.length < 3) return res.json([]);

    var apiKey = process.env.ORS_API_KEY;
    if (!apiKey) return res.json([]);

    // Check cache first — avoids repeat API calls for the same text
    var cacheKey = "ac:" + text.toLowerCase();
    var cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    var url =
      "https://api.openrouteservice.org/geocode/autocomplete?" +
      "api_key=" +
      apiKey +
      "&text=" +
      encodeURIComponent(text) +
      "&boundary.country=GB" +
      "&size=5" +
      "&layers=locality,county,region,address,venue,neighbourhood";

    var response = await fetch(url);

    // Handle rate limiting gracefully — return empty instead of crashing
    if (response.status === 429) {
      console.warn("ORS rate limit hit on autocomplete");
      return res.json([]);
    }

    var data = await response.json();

    var suggestions = [];
    if (data.features && data.features.length > 0) {
      suggestions = data.features.map(function (feature) {
        return {
          label: feature.properties.label || feature.properties.name,
          name: feature.properties.name || "",
          region: feature.properties.region || "",
          county: feature.properties.county || "",
          country: feature.properties.country || "",
          coordinates: feature.geometry.coordinates,
        };
      });
    }

    // Cache the result so typing the same prefix again is instant
    cacheSet(cacheKey, suggestions);
    res.json(suggestions);
  } catch (err) {
    console.error("Autocomplete error:", err.message);
    res.json([]);
  }
};

// ── GET /api/reverse-geocode?lat=...&lng=... ────────────────
// Converts GPS coordinates to a place name (for geolocation button)
exports.reverseGeocode = async (req, res) => {
  try {
    var lat = req.query.lat;
    var lng = req.query.lng;
    if (!lat || !lng)
      return res.status(400).json({ error: "lat and lng required" });

    var apiKey = process.env.ORS_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "ORS API key not configured" });

    // Check cache first
    var cacheKey = "rev:" + lat + "," + lng;
    var cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    var url =
      "https://api.openrouteservice.org/geocode/reverse?" +
      "api_key=" +
      apiKey +
      "&point.lat=" +
      lat +
      "&point.lon=" +
      lng +
      "&size=1";

    var response = await fetch(url);

    // Handle rate limiting — fall back to raw coordinates
    if (response.status === 429) {
      console.warn("ORS rate limit hit on reverse geocode");
      return res.json({
        label: lat + ", " + lng,
        coordinates: [parseFloat(lng), parseFloat(lat)],
      });
    }

    var data = await response.json();

    var result;
    if (data.features && data.features.length > 0) {
      var place = data.features[0].properties;
      result = {
        label: place.label || place.name || lat + ", " + lng,
        coordinates: [parseFloat(lng), parseFloat(lat)],
      };
    } else {
      result = {
        label: lat + ", " + lng,
        coordinates: [parseFloat(lng), parseFloat(lat)],
      };
    }

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("Reverse geocode error:", err.message);
    res.json({
      label: req.query.lat + ", " + req.query.lng,
      coordinates: [parseFloat(req.query.lng), parseFloat(req.query.lat)],
    });
  }
};

// ═══════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Geocode a place name → [longitude, latitude]
// Results are cached to avoid repeated lookups for the same place
async function geocode(text, apiKey) {
  var cacheKey = "geo:" + text.toLowerCase();
  var cached = cacheGet(cacheKey);
  if (cached) return cached;

  var url =
    "https://api.openrouteservice.org/geocode/search?" +
    "api_key=" +
    apiKey +
    "&text=" +
    encodeURIComponent(text) +
    "&size=1" +
    "&boundary.country=GB";

  var response = await fetch(url);

  if (response.status === 429) {
    console.warn("ORS rate limit hit on geocode");
    return null;
  }

  var data = await response.json();

  if (data.features && data.features.length > 0) {
    var coords = data.features[0].geometry.coordinates;
    cacheSet(cacheKey, coords);
    return coords;
  }
  return null;
}

// Get directions between two coordinate pairs with elevation and steepness
// Results are cached so the same route doesn't burn multiple API calls
async function getDirectionsWithElevation(originCoords, destCoords, apiKey) {
  var cacheKey = "dir:" + originCoords.join(",") + ">" + destCoords.join(",");
  var cached = cacheGet(cacheKey);
  if (cached) return cached;

  var url = "https://api.openrouteservice.org/v2/directions/driving-car";

  var response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [originCoords, destCoords],
      elevation: true,
      extra_info: ["steepness"],
      units: "km",
    }),
  });

  if (response.status === 429) {
    console.warn("ORS rate limit hit on directions");
    return null;
  }

  var data = await response.json();

  if (data.error) {
    console.error("ORS Directions error:", data.error);
    return null;
  }

  if (!data.routes || !data.routes.length) return null;

  var route = data.routes[0];
  var summary = route.summary;

  var result = {
    distance: Math.round(summary.distance * 100) / 100,
    duration: Math.round(summary.duration),
    ascent: Math.round(summary.ascent || 0),
    descent: Math.round(summary.descent || 0),
    steepness: route.extras ? route.extras.steepness : null,
  };

  cacheSet(cacheKey, result);
  return result;
}

// Calculate weighted average gradient and emissions modifier from steepness data
//
// ORS steepness IDs map to gradient ranges:
//   -5: < -16%    -4: -12 to -16%   -3: -7 to -12%
//   -2: -4 to -7% -1: -1 to -4%      0: -1% to 1%
//    1: 1 to 4%    2: 4 to 7%         3: 7 to 12%
//    4: 12 to 16%  5: > 16%
//
// Emissions modifier formula:
//   Uphill:   +3% emissions per 1% gradient
//   Downhill: -1.5% emissions per 1% gradient
//   (uphill costs more fuel than downhill saves)
function calculateGradient(routeData) {
  if (!routeData.steepness || !routeData.steepness.summary) {
    if (routeData.distance > 0) {
      var distM = routeData.distance * 1000;
      var net = routeData.ascent - routeData.descent;
      var avg = (net / distM) * 100;
      return {
        avgGradient: Math.round(avg * 100) / 100,
        modifier: calcModifierFallback(
          routeData.ascent,
          routeData.descent,
          distM,
        ),
      };
    }
    return { avgGradient: 0, modifier: 1.0 };
  }

  // Steepness ID → midpoint gradient %
  var steepMap = {
    "-5": -18,
    "-4": -14,
    "-3": -9.5,
    "-2": -5.5,
    "-1": -2.5,
    0: 0,
    1: 2.5,
    2: 5.5,
    3: 9.5,
    4: 14,
    5: 18,
  };

  var totalDist = 0,
    wGrad = 0,
    wMod = 0;

  for (var i = 0; i < routeData.steepness.summary.length; i++) {
    var seg = routeData.steepness.summary[i];
    var mid = steepMap[String(seg.value)] || 0;
    var d = seg.distance;
    totalDist += d;
    wGrad += mid * d;

    if (mid > 0) wMod += (1 + mid * 0.03) * d;
    else if (mid < 0) wMod += (1 + mid * 0.015) * d;
    else wMod += 1.0 * d;
  }

  var avgGradient =
    totalDist > 0 ? Math.round((wGrad / totalDist) * 100) / 100 : 0;
  var modifier =
    totalDist > 0 ? Math.round((wMod / totalDist) * 1000) / 1000 : 1.0;

  // Clamp: minimum 0.85 (steep downhill), maximum 1.6 (very steep uphill)
  modifier = Math.max(0.85, Math.min(1.6, modifier));

  return { avgGradient: avgGradient, modifier: modifier };
}

// Fallback modifier when steepness segment data is not available
// Uses total ascent/descent ratio instead
function calcModifierFallback(ascent, descent, distM) {
  var up = distM > 0 ? (ascent / distM) * 100 : 0;
  var down = distM > 0 ? (descent / distM) * 100 : 0;
  var mod = 1.0 + up * 0.03 - down * 0.015;
  return Math.round(Math.max(0.85, Math.min(1.6, mod)) * 1000) / 1000;
}
