# 🌱 GreenRoute

GreenRoute is a web application that helps users track the **carbon emissions of their journeys** and encourages more sustainable transportation choices.

The application calculates emissions using **transport modes, vehicle data, and elevation-based gradient adjustments**.

## Live Demo

[View GreenRoute on Render](https://greenroute-quwy.onrender.com)

---

# 🚀 Getting Started

Follow these steps to run the application locally.

---

# 1️⃣ Install Dependencies

From the project root directory run:

```
npm install
```

---

# 2️⃣ Create a `.env` File

Before running the application you must create a **`.env` configuration file** in the root directory.

Create a file named:

```
.env
```

Place it in the same folder as `package.json`.

---

# 3️⃣ Add the Required Environment Variables

Copy the following configuration into the `.env` file and replace values where necessary.

```
PORT=3000
MONGODB_URI=your_mongodb_connection_string

SESSION_SECRET=greenroute_super_secret_session_key_change_in_production
BCRYPT_SALT_ROUNDS=10
NODE_ENV=development

ELEVATION_API_URL=https://api.open-elevation.com/api/v1/lookup
ORS_API_KEY=your_openrouteservice_api_key
```

---

# 🔑 Variable Explanation

| Variable               | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| **PORT**               | The port on which the server runs                             |
| **MONGODB_URI**        | MongoDB database connection string                            |
| **SESSION_SECRET**     | Secret used to secure user sessions                           |
| **BCRYPT_SALT_ROUNDS** | Password hashing strength                                     |
| **NODE_ENV**           | Application environment (`development` or `production`)       |
| **ELEVATION_API_URL**  | API used to retrieve elevation data for gradient calculations |
| **ORS_API_KEY**        | API key for the OpenRouteService routing API                  |

---

# 🔑 Getting an OpenRouteService API Key

1. Go to
   https://openrouteservice.org/dev/#/signup

2. Create a free account.

3. Generate an API key from the dashboard.

4. Paste the key into your `.env` file:

```
ORS_API_KEY=your_api_key_here
```

---

# ▶️ Running the Application

After configuring the `.env` file run:

```
npm start
```

The application will start on:

```
http://localhost:3000
```

---

# 🌐 Deploying Live

This project is a Node.js/Express application, so it cannot be hosted with GitHub Pages. GitHub Pages only hosts static frontend files and will not run the Express server, EJS routes, MongoDB sessions, or API-backed features.

The repository includes a `render.yaml` blueprint for deploying the app on Render.

## Render Setup

1. Push this repository to GitHub.
2. Go to https://render.com and create a new Blueprint from this repository.
3. Render will detect `render.yaml` in the repository root.
4. Add the required secret environment variables:

```
MONGODB_URI=your_mongodb_connection_string
ORS_API_KEY=your_openrouteservice_api_key
```

`SESSION_SECRET` is generated automatically by the Render blueprint.

## After Deployment

Seed the database from a Render shell if needed:

```
npm run seed:all
```

The deployed app will be available at the Render service URL.

---

# 📂 Important Notes

- The `.env` file **should not be committed to GitHub**.
- API keys and database credentials must remain **private**.
- Make sure MongoDB is running or your connection string is valid.

---

# 🌍 Features

- Journey emission tracking
- Vehicle-based CO₂ calculations
- Gradient-adjusted emissions
- Euro 6 vehicle database
- User dashboard and analytics
- Admin management panel

---

# 🛠 Tech Stack

- **Node.js**
- **Express.js**
- **MongoDB**
- **EJS**
- **OpenRouteService API**
- **Open Elevation API**

---

# 📄 License

This project is provided for **educational purposes**.
