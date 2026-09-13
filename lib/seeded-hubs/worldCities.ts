export type WorldCityRegion =
  | "North America"
  | "South America"
  | "Europe"
  | "Africa"
  | "Middle East"
  | "Asia"
  | "Oceania";

export type WorldCity = {
  title: string;
  locationHint: string;
  region: WorldCityRegion;
  lat: number;
  lng: number;
};

/** Curated list of major world cities for bulk-planting seeded hubs. `title`
 * is a hub-name-safe slug (lowercase letters/numbers only); `locationHint` is
 * the human-readable display name. */
export const WORLD_CITIES: WorldCity[] = [
  // North America
  { title: "newyorkcity", locationHint: "New York, NY", region: "North America", lat: 40.7128, lng: -74.006 },
  { title: "losangeles", locationHint: "Los Angeles, CA", region: "North America", lat: 34.0522, lng: -118.2437 },
  { title: "chicago", locationHint: "Chicago, IL", region: "North America", lat: 41.8781, lng: -87.6298 },
  { title: "houston", locationHint: "Houston, TX", region: "North America", lat: 29.7604, lng: -95.3698 },
  { title: "miami", locationHint: "Miami, FL", region: "North America", lat: 25.7617, lng: -80.1918 },
  { title: "sanfrancisco", locationHint: "San Francisco, CA", region: "North America", lat: 37.7749, lng: -122.4194 },
  { title: "seattle", locationHint: "Seattle, WA", region: "North America", lat: 47.6062, lng: -122.3321 },
  { title: "boston", locationHint: "Boston, MA", region: "North America", lat: 42.3601, lng: -71.0589 },
  { title: "atlanta", locationHint: "Atlanta, GA", region: "North America", lat: 33.749, lng: -84.388 },
  { title: "dallas", locationHint: "Dallas, TX", region: "North America", lat: 32.7767, lng: -96.797 },
  { title: "austin", locationHint: "Austin, TX", region: "North America", lat: 30.2672, lng: -97.7431 },
  { title: "denver", locationHint: "Denver, CO", region: "North America", lat: 39.7392, lng: -104.9903 },
  { title: "phoenix", locationHint: "Phoenix, AZ", region: "North America", lat: 33.4484, lng: -112.074 },
  { title: "lasvegas", locationHint: "Las Vegas, NV", region: "North America", lat: 36.1699, lng: -115.1398 },
  { title: "washingtondc", locationHint: "Washington, DC", region: "North America", lat: 38.9072, lng: -77.0369 },
  { title: "philadelphia", locationHint: "Philadelphia, PA", region: "North America", lat: 39.9526, lng: -75.1652 },
  { title: "sandiego", locationHint: "San Diego, CA", region: "North America", lat: 32.7157, lng: -117.1611 },
  { title: "neworleans", locationHint: "New Orleans, LA", region: "North America", lat: 29.9511, lng: -90.0715 },
  { title: "nashville", locationHint: "Nashville, TN", region: "North America", lat: 36.1627, lng: -86.7816 },
  { title: "portland", locationHint: "Portland, OR", region: "North America", lat: 45.5152, lng: -122.6784 },
  { title: "toronto", locationHint: "Toronto, Canada", region: "North America", lat: 43.6532, lng: -79.3832 },
  { title: "vancouver", locationHint: "Vancouver, Canada", region: "North America", lat: 49.2827, lng: -123.1207 },
  { title: "montreal", locationHint: "Montreal, Canada", region: "North America", lat: 45.5019, lng: -73.5674 },
  { title: "mexicocity", locationHint: "Mexico City, Mexico", region: "North America", lat: 19.4326, lng: -99.1332 },
  { title: "cancun", locationHint: "Cancun, Mexico", region: "North America", lat: 21.1619, lng: -86.8515 },

  // South America
  { title: "saopaulo", locationHint: "São Paulo, Brazil", region: "South America", lat: -23.5505, lng: -46.6333 },
  { title: "riodejaneiro", locationHint: "Rio de Janeiro, Brazil", region: "South America", lat: -22.9068, lng: -43.1729 },
  { title: "buenosaires", locationHint: "Buenos Aires, Argentina", region: "South America", lat: -34.6037, lng: -58.3816 },
  { title: "santiago", locationHint: "Santiago, Chile", region: "South America", lat: -33.4489, lng: -70.6693 },
  { title: "lima", locationHint: "Lima, Peru", region: "South America", lat: -12.0464, lng: -77.0428 },
  { title: "bogota", locationHint: "Bogotá, Colombia", region: "South America", lat: 4.711, lng: -74.0721 },
  { title: "medellin", locationHint: "Medellín, Colombia", region: "South America", lat: 6.2442, lng: -75.5812 },
  { title: "quito", locationHint: "Quito, Ecuador", region: "South America", lat: -0.1807, lng: -78.4678 },
  { title: "montevideo", locationHint: "Montevideo, Uruguay", region: "South America", lat: -34.9011, lng: -56.1645 },

  // Europe
  { title: "london", locationHint: "London, UK", region: "Europe", lat: 51.5072, lng: -0.1276 },
  { title: "paris", locationHint: "Paris, France", region: "Europe", lat: 48.8566, lng: 2.3522 },
  { title: "berlin", locationHint: "Berlin, Germany", region: "Europe", lat: 52.52, lng: 13.405 },
  { title: "madrid", locationHint: "Madrid, Spain", region: "Europe", lat: 40.4168, lng: -3.7038 },
  { title: "barcelona", locationHint: "Barcelona, Spain", region: "Europe", lat: 41.3851, lng: 2.1734 },
  { title: "rome", locationHint: "Rome, Italy", region: "Europe", lat: 41.9028, lng: 12.4964 },
  { title: "milan", locationHint: "Milan, Italy", region: "Europe", lat: 45.4642, lng: 9.19 },
  { title: "amsterdam", locationHint: "Amsterdam, Netherlands", region: "Europe", lat: 52.3676, lng: 4.9041 },
  { title: "lisbon", locationHint: "Lisbon, Portugal", region: "Europe", lat: 38.7223, lng: -9.1393 },
  { title: "dublin", locationHint: "Dublin, Ireland", region: "Europe", lat: 53.3498, lng: -6.2603 },
  { title: "vienna", locationHint: "Vienna, Austria", region: "Europe", lat: 48.2082, lng: 16.3738 },
  { title: "zurich", locationHint: "Zurich, Switzerland", region: "Europe", lat: 47.3769, lng: 8.5417 },
  { title: "brussels", locationHint: "Brussels, Belgium", region: "Europe", lat: 50.8503, lng: 4.3517 },
  { title: "copenhagen", locationHint: "Copenhagen, Denmark", region: "Europe", lat: 55.6761, lng: 12.5683 },
  { title: "stockholm", locationHint: "Stockholm, Sweden", region: "Europe", lat: 59.3293, lng: 18.0686 },
  { title: "oslo", locationHint: "Oslo, Norway", region: "Europe", lat: 59.9139, lng: 10.7522 },
  { title: "helsinki", locationHint: "Helsinki, Finland", region: "Europe", lat: 60.1699, lng: 24.9384 },
  { title: "warsaw", locationHint: "Warsaw, Poland", region: "Europe", lat: 52.2297, lng: 21.0122 },
  { title: "prague", locationHint: "Prague, Czechia", region: "Europe", lat: 50.0755, lng: 14.4378 },
  { title: "budapest", locationHint: "Budapest, Hungary", region: "Europe", lat: 47.4979, lng: 19.0402 },
  { title: "athens", locationHint: "Athens, Greece", region: "Europe", lat: 37.9838, lng: 23.7275 },
  { title: "istanbul", locationHint: "Istanbul, Turkey", region: "Europe", lat: 41.0082, lng: 28.9784 },
  { title: "moscow", locationHint: "Moscow, Russia", region: "Europe", lat: 55.7558, lng: 37.6173 },
  { title: "kyiv", locationHint: "Kyiv, Ukraine", region: "Europe", lat: 50.4501, lng: 30.5234 },

  // Middle East
  { title: "dubai", locationHint: "Dubai, UAE", region: "Middle East", lat: 25.2048, lng: 55.2708 },
  { title: "abudhabi", locationHint: "Abu Dhabi, UAE", region: "Middle East", lat: 24.4539, lng: 54.3773 },
  { title: "doha", locationHint: "Doha, Qatar", region: "Middle East", lat: 25.2854, lng: 51.531 },
  { title: "riyadh", locationHint: "Riyadh, Saudi Arabia", region: "Middle East", lat: 24.7136, lng: 46.6753 },
  { title: "telaviv", locationHint: "Tel Aviv, Israel", region: "Middle East", lat: 32.0853, lng: 34.7818 },
  { title: "amman", locationHint: "Amman, Jordan", region: "Middle East", lat: 31.9454, lng: 35.9284 },

  // Africa
  { title: "cairo", locationHint: "Cairo, Egypt", region: "Africa", lat: 30.0444, lng: 31.2357 },
  { title: "lagos", locationHint: "Lagos, Nigeria", region: "Africa", lat: 6.5244, lng: 3.3792 },
  { title: "nairobi", locationHint: "Nairobi, Kenya", region: "Africa", lat: -1.2921, lng: 36.8219 },
  { title: "capetown", locationHint: "Cape Town, South Africa", region: "Africa", lat: -33.9249, lng: 18.4241 },
  { title: "johannesburg", locationHint: "Johannesburg, South Africa", region: "Africa", lat: -26.2041, lng: 28.0473 },
  { title: "casablanca", locationHint: "Casablanca, Morocco", region: "Africa", lat: 33.5731, lng: -7.5898 },
  { title: "accra", locationHint: "Accra, Ghana", region: "Africa", lat: 5.6037, lng: -0.187 },
  { title: "addisababa", locationHint: "Addis Ababa, Ethiopia", region: "Africa", lat: 9.0192, lng: 38.7525 },

  // Asia
  { title: "tokyo", locationHint: "Tokyo, Japan", region: "Asia", lat: 35.6762, lng: 139.6503 },
  { title: "osaka", locationHint: "Osaka, Japan", region: "Asia", lat: 34.6937, lng: 135.5023 },
  { title: "seoul", locationHint: "Seoul, South Korea", region: "Asia", lat: 37.5665, lng: 126.978 },
  { title: "beijing", locationHint: "Beijing, China", region: "Asia", lat: 39.9042, lng: 116.4074 },
  { title: "shanghai", locationHint: "Shanghai, China", region: "Asia", lat: 31.2304, lng: 121.4737 },
  { title: "hongkong", locationHint: "Hong Kong", region: "Asia", lat: 22.3193, lng: 114.1694 },
  { title: "singapore", locationHint: "Singapore", region: "Asia", lat: 1.3521, lng: 103.8198 },
  { title: "bangkok", locationHint: "Bangkok, Thailand", region: "Asia", lat: 13.7563, lng: 100.5018 },
  { title: "kualalumpur", locationHint: "Kuala Lumpur, Malaysia", region: "Asia", lat: 3.139, lng: 101.6869 },
  { title: "jakarta", locationHint: "Jakarta, Indonesia", region: "Asia", lat: -6.2088, lng: 106.8456 },
  { title: "manila", locationHint: "Manila, Philippines", region: "Asia", lat: 14.5995, lng: 120.9842 },
  { title: "hanoi", locationHint: "Hanoi, Vietnam", region: "Asia", lat: 21.0278, lng: 105.8342 },
  { title: "hochiminhcity", locationHint: "Ho Chi Minh City, Vietnam", region: "Asia", lat: 10.8231, lng: 106.6297 },
  { title: "mumbai", locationHint: "Mumbai, India", region: "Asia", lat: 19.076, lng: 72.8777 },
  { title: "delhi", locationHint: "New Delhi, India", region: "Asia", lat: 28.6139, lng: 77.209 },
  { title: "bangalore", locationHint: "Bangalore, India", region: "Asia", lat: 12.9716, lng: 77.5946 },
  { title: "taipei", locationHint: "Taipei, Taiwan", region: "Asia", lat: 25.033, lng: 121.5654 },
  { title: "karachi", locationHint: "Karachi, Pakistan", region: "Asia", lat: 24.8607, lng: 67.0011 },
  { title: "dhaka", locationHint: "Dhaka, Bangladesh", region: "Asia", lat: 23.8103, lng: 90.4125 },

  // Oceania
  { title: "sydney", locationHint: "Sydney, Australia", region: "Oceania", lat: -33.8688, lng: 151.2093 },
  { title: "melbourne", locationHint: "Melbourne, Australia", region: "Oceania", lat: -37.8136, lng: 144.9631 },
  { title: "brisbane", locationHint: "Brisbane, Australia", region: "Oceania", lat: -27.4698, lng: 153.0251 },
  { title: "perth", locationHint: "Perth, Australia", region: "Oceania", lat: -31.9505, lng: 115.8605 },
  { title: "auckland", locationHint: "Auckland, New Zealand", region: "Oceania", lat: -36.8485, lng: 174.7633 },
];

export const WORLD_CITY_REGIONS: WorldCityRegion[] = [
  "North America",
  "South America",
  "Europe",
  "Middle East",
  "Africa",
  "Asia",
  "Oceania",
];
