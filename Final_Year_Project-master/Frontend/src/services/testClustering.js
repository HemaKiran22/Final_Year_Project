// Quick test for clustering algorithm
import { clusterRides, formatClusterResults, getClusteringStats } from './clusteringService.js';

// Test data: 9 users from Hennur to Christ University
const testRides = [
  {
    id: '1',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:00',
    date: '2025-12-10',
    driverName: 'Alice',
    userId: 'user1',
    pickupLat: 12.9866,
    pickupLng: 77.6487,
  },
  {
    id: '2',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:05',
    date: '2025-12-10',
    driverName: 'Bob',
    userId: 'user2',
    pickupLat: 12.9870,
    pickupLng: 77.6490,
  },
  {
    id: '3',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:10',
    date: '2025-12-10',
    driverName: 'Charlie',
    userId: 'user3',
    pickupLat: 12.9875,
    pickupLng: 77.6485,
  },
  {
    id: '4',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:02',
    date: '2025-12-10',
    driverName: 'David',
    userId: 'user4',
    pickupLat: 12.9868,
    pickupLng: 77.6488,
  },
  {
    id: '5',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:07',
    date: '2025-12-10',
    driverName: 'Emma',
    userId: 'user5',
    pickupLat: 12.9872,
    pickupLng: 77.6492,
  },
  {
    id: '6',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:12',
    date: '2025-12-10',
    driverName: 'Frank',
    userId: 'user6',
    pickupLat: 12.9877,
    pickupLng: 77.6483,
  },
  {
    id: '7',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:03',
    date: '2025-12-10',
    driverName: 'Grace',
    userId: 'user7',
    pickupLat: 12.9869,
    pickupLng: 77.6489,
  },
  {
    id: '8',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:08',
    date: '2025-12-10',
    driverName: 'Henry',
    userId: 'user8',
    pickupLat: 12.9873,
    pickupLng: 77.6491,
  },
  {
    id: '9',
    community: 'Hennur',
    destination: 'Christ University',
    time: '08:13',
    date: '2025-12-10',
    driverName: 'Ivy',
    userId: 'user9',
    pickupLat: 12.9878,
    pickupLng: 77.6482,
  },
];

console.log('🚗 Testing Ride Clustering Algorithm\n');
console.log('Input: 9 users from Hennur → Christ University (8:00-8:13 AM)\n');

// Run clustering (K-Means)
const clustersKMeans = clusterRides(testRides, {
  maxGroupSize: 3,
  timeWindowMinutes: 15,
  proximityKm: 2,
  algorithm: 'kmeans'
});

console.log(`✅ K-Means: Created ${clustersKMeans.length} groups\n`);

// Format results
const formatted = formatClusterResults(clustersKMeans);

// Display groups
formatted.forEach(group => {
  console.log(`Group ${group.groupId}: ${group.route}`);
  console.log(`  Time: ${group.time}`);
  console.log(`  Members: ${group.members}`);
  console.log(`  Riders: ${group.riders.map(r => r.name).join(', ')}`);
  console.log(`  Total Cost: ₹${group.estimatedCost}`);
  console.log(`  Per Person: ₹${Math.round(group.costPerPerson)}`);
  console.log('');
});

// Get statistics
const stats = getClusteringStats(testRides, clustersKMeans);

console.log('📊 Statistics:');
console.log(`  Total Rides: ${stats.totalRides}`);
console.log(`  Total Groups: ${stats.totalGroups}`);
console.log(`  Rides Reduced: ${stats.ridesReduced}`);
console.log(`  Reduction: ${stats.reductionPercentage}%`);
console.log(`  Average Group Size: ${stats.averageGroupSize}`);
console.log(`  Total Savings: ₹${stats.costSavings}`);
console.log('');

// Run clustering (DBSCAN)
const clustersDBSCAN = clusterRides(testRides, {
  maxGroupSize: 3,
  timeWindowMinutes: 15,
  proximityKm: 2,
  algorithm: 'dbscan',
  epsKm: 0.5,
  minPts: 2
});

console.log(`🧪 DBSCAN: Created ${clustersDBSCAN.length} groups`);
const formattedDb = formatClusterResults(clustersDBSCAN);
formattedDb.forEach(group => {
  console.log(`DBSCAN Group ${group.groupId}: ${group.route} • CO₂ saved ~${group.co2SavingPct}%`);
});

console.log('✨ Test Complete! Open http://localhost:5173/ and:');
console.log('   1. Login to Dashboard');
console.log('   2. Click "Find My Group" or navigate to "Ride Groups"');
console.log('   3. Post some rides to see live clustering!');
