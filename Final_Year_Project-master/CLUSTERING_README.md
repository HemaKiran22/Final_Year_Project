# Ride Clustering Feature

## Overview
AI-powered ride grouping algorithm that optimizes carpooling by clustering users traveling from the same community to the same destination.

## How It Works

### Algorithm: K-Means Clustering
1. **Pre-filtering**: Groups rides by community and destination
2. **Time Compatibility**: Matches rides within a 15-minute window
3. **Location Proximity**: Groups nearby pickup locations (within 2km)
4. **Optimization**: Uses K-Means to create groups of max 3 users per auto

### Example Scenario
```
Input: 
- 9 users from Hennur → Christ University
- Time: 8:00 AM - 8:15 AM

Output:
- Group 1: User1, User2, User3 (₹133/person)
- Group 2: User4, User5, User6 (₹133/person)  
- Group 3: User7, User8, User9 (₹133/person)

Savings:
- Rides reduced: 6 autos (from 9 to 3)
- Cost savings: ~₹540 total
- Reduction: 66.7%
```

## Features

### 1. Automatic Clustering
- Runs automatically when rides are posted
- Real-time updates as new rides are added
- Smart grouping based on multiple factors

### 2. Visual Dashboard
- **Stats Cards**: Shows total savings, reduction %, average group size
- **Group Cards**: Displays each optimized group with:
  - Route information
  - Member list
  - Time & date
  - Cost breakdown (total + per person)

### 3. Configurable Parameters
```javascript
clusterRides(rides, {
  maxGroupSize: 3,        // Max users per auto
  timeWindowMinutes: 15,  // Time compatibility window
  proximityKm: 2          // Max pickup distance
});
```

## Files Created

### 1. `src/services/clusteringService.js`
**Main clustering logic**
- `clusterRides()` - Core clustering algorithm
- `formatClusterResults()` - Format groups for display
- `getClusteringStats()` - Calculate savings and metrics
- Distance calculations (Haversine formula)
- K-Means implementation

### 2. `src/components/ClusteredRideGroups.jsx`
**UI Component**
- Stats summary cards
- Group cards with member details
- Cost breakdown display
- Join group button

### 3. `src/Screens/Dashboard.jsx` (Modified)
**Integration**
- Added "Ride Groups" menu item
- Auto-clustering on ride updates
- State management for clusters and stats
- "Find My Group" quick action button

## Usage

### For Users
1. Go to Dashboard
2. Click "Find My Group" or navigate to "Ride Groups" in sidebar
3. View optimized groups for your route
4. See cost savings and environmental impact
5. Join a group (coming soon)

### For Developers
```javascript
import { clusterRides, formatClusterResults, getClusteringStats } from './services/clusteringService';

// Get all rides from Firestore
const rides = [...]; // Your rides array

// Cluster them
const clusters = clusterRides(rides, {
  maxGroupSize: 3,
  timeWindowMinutes: 15,
  proximityKm: 2
});

// Format for display
const formatted = formatClusterResults(clusters);

// Get statistics
const stats = getClusteringStats(rides, clusters);

console.log(stats);
// {
//   totalRides: 9,
//   totalGroups: 3,
//   ridesReduced: 6,
//   reductionPercentage: "66.7",
//   averageGroupSize: "3.0",
//   costSavings: 540
// }
```

## Benefits

### For Users
- **Save Money**: Share auto costs (₹360 → ₹133 per person)
- **Reduce Traffic**: Fewer vehicles on road
- **Eco-Friendly**: Lower carbon emissions
- **Social**: Meet community members

### For Platform
- **Increased Engagement**: More users pooling together
- **Value Proposition**: Clear cost savings shown
- **Scalable**: Works with any number of rides
- **Data-Driven**: Real metrics and insights

## Future Enhancements
1. **Real-time Group Joining**: Users can join/leave groups
2. **Route Optimization**: Calculate optimal pickup sequence
3. **Smart Notifications**: Alert users when their group forms
4. **Driver Assignment**: Auto-assign best driver for each group
5. **Dynamic Pricing**: Adjust costs based on group size
6. **ML Improvements**: Learn from user preferences over time

## Technical Details

### Distance Calculation
Uses Haversine formula for accurate lat/lng distance:
```javascript
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  // ... Haversine implementation
  return distance_in_km;
}
```

### K-Means Algorithm
- **Initialization**: Random centroid selection
- **Assignment**: Assign each ride to nearest centroid
- **Update**: Recalculate centroids
- **Iteration**: Repeat 10 times or until convergence
- **Output**: Optimal groups

### Time Complexity
- **Pre-filtering**: O(n) - group by route
- **K-Means**: O(n * k * i) where:
  - n = number of rides
  - k = number of groups
  - i = iterations (10)
- **Total**: O(n * k) - very efficient even for large datasets

## Testing

### Test Case 1: Same Route, Same Time
```javascript
const rides = [
  { community: 'Hennur', destination: 'Christ University', time: '08:00', ... },
  { community: 'Hennur', destination: 'Christ University', time: '08:05', ... },
  { community: 'Hennur', destination: 'Christ University', time: '08:10', ... },
];

const clusters = clusterRides(rides);
// Expected: 1 group with 3 members
```

### Test Case 2: Different Routes
```javascript
const rides = [
  { community: 'Hennur', destination: 'Christ University', ... },
  { community: 'Indiranagar', destination: 'MG Road', ... },
];

const clusters = clusterRides(rides);
// Expected: 2 groups (1 member each)
```

### Test Case 3: Time Window
```javascript
const rides = [
  { community: 'Hennur', destination: 'Christ', time: '08:00' },
  { community: 'Hennur', destination: 'Christ', time: '08:30' }, // 30 min gap
];

const clusters = clusterRides(rides, { timeWindowMinutes: 15 });
// Expected: 2 groups (time window exceeded)
```

## Support
For issues or questions about the clustering feature, check:
- Algorithm logic: `src/services/clusteringService.js`
- UI component: `src/components/ClusteredRideGroups.jsx`
- Integration: `src/Screens/Dashboard.jsx`
