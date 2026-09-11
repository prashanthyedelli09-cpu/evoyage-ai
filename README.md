# EVoyage AI

**Smart Charge Break Recommendation Engine**

EVoyage AI helps EV drivers make the most of their charging time by recommending the best nearby places that fit perfectly inside their charging window.

## ⚡ Core Feature: Smart Charge Break

While your EV charges, EVoyage AI ranks nearby restaurants, cafes, and activities based on:

- **Time fit** — Does the visit fit comfortably inside the charging duration?
- **Distance** — How far is it from the charging station?
- **User preferences** — Food, coffee, relaxing, shopping, etc.
- **Rating** — Quality of the place
- **Budget** — Does it match the user's spending limit?

### Scoring Priority
1. Time fit (30%)
2. Distance (25%)
3. User preference (20%)
4. Rating (15%)
5. Budget (10%)

## 📁 Project Structure

```
lib/
└── recommendations/
    └── smart-break.ts   ← Core recommendation engine
```

## 🚀 Quick Start

### Main Function

```ts
import { getSmartBreakRecommendations } from "@/lib/recommendations/smart-break";

const recommendations = getSmartBreakRecommendations({
  charging: {
    station: {
      id: "station-001",
      name: "EV Charging Hub",
      latitude: 17.4485,
      longitude: 78.3908,
    },
    chargingDurationMinutes: 35,
    estimatedCost: 280,
    currency: "₹",
  },
  preferences: {
    categories: ["coffee", "relaxing"],
    maxBudget: 500,
    minRating: 4,
  },
  places: nearbyPlaces, // Array of Place objects
});
```

The result is already sorted (best first). You can directly display:

```ts
recommendations[0] // Best recommendation
recommendations[1]
recommendations[2]
```

### Integration Contract

```
SmartBreakInput
        ↓
getSmartBreakRecommendations()
        ↓
SmartBreakRecommendation[]
```

## 🧠 How It Works

1. Calculates walking distance from the charging station to each place (Haversine formula)
2. Estimates round-trip walking time
3. Checks if the visit + travel fits inside the charging window (with a 5-minute safety buffer)
4. Scores each place across 5 dimensions
5. Generates a human-readable explanation
6. Sorts results: places that fit the charging window come first, then by total score

## 🛠️ Owner

**Prashu** — Smart Charge Break Recommendation Engine

## 📦 Next Steps

- Build `app/smart-break/page.tsx` with:
  - Charging countdown
  - Ranked place cards
  - Recommendation explanations
  - Loading / empty / error states

---

Made for the hackathon ⚡
