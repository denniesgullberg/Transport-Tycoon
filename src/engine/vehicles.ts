/**
 * vehicles.ts
 * The vehicle catalogue: buses, trucks (one family per cargo), locomotives, wagons,
 * ships and aircraft. Every model has its own speed, capacity, price, running cost,
 * reliability, life span and LOOK. Each look is drawn as an SVG sprite by vehicleSvg().
 *
 * Models appear in the shop by year and retire after a few decades, like the original.
 * Trains are built from a locomotive plus N wagons (see consistStats / getModel).
 *
 * No imports. tycoon-core.ts re-exports MODELS, availableModels and VehicleModel from here.
 */

export type VehicleType = "bus" | "truck" | "locomotive" | "wagon" | "train" | "ship" | "aircraft";
export type CargoKey = "passengers" | "mail" | "coal" | "goods" | "wood" | "steel" | "grain"
  | "paper" | "food" | "gold" | "oil" | "rubber" | "fruit" | "water" | "diamonds"
  | "sugar" | "plastic" | "cola" | "sweets" | "toys" | "fizzy" | "batteries";

export type Shape =
  | "minibus" | "bus" | "doubledecker" | "artic" | "coach"
  | "tipper" | "vanTruck" | "flatLogs" | "flatCoils" | "hopperTruck"
  | "steam" | "diesel" | "electric" | "fast"
  | "paxCar" | "mailVan" | "openHopper" | "boxVan" | "logWagon" | "grainHopper" | "coilWagon"
  | "ferry" | "cargoShip" | "propPlane" | "jet"
  | "tankTruck" | "tankWagon" | "tanker" | "bulkShip";

export interface Look { shape: Shape; body: string; accent: string; roof: string; trim: string }

export interface VehicleModel {
  id: string;
  name: string;
  type: VehicleType;
  cargo: CargoKey;
  introYear: number;
  retiredYear: number;          // no longer sold from this year
  speedKmh: number;
  capacity: number;             // passengers, or tonnes / crates / bags
  price: number;
  runningCostPerYear: number;
  maxAgeYears: number;
  baseReliability: number;      // 0..1
  powerHp?: number;             // locomotives
  weightTons?: number;          // wagons and locomotives, loaded
  look: Look;
  supported: boolean;           // false = in the catalogue but the game can't run it yet
  composite?: boolean;          // a locomotive + wagons train built by the player
  parts?: { locoId: string; wagonId: string; n: number };
}

const CARGO_LABEL: Record<CargoKey, string> = {
  passengers: "passengers", mail: "bags of mail", coal: "tonnes of coal", goods: "crates of goods",
  wood: "tonnes of wood", steel: "tonnes of steel", grain: "tonnes of grain",
  paper: "tonnes of paper", food: "tonnes of food", gold: "bags of gold", oil: "kilolitres of oil", rubber: "kilolitres of rubber",
  fruit: "tonnes of fruit", water: "kilolitres of water", diamonds: "bags of diamonds", sugar: "tonnes of sugar", plastic: "kilolitres of plastic",
  cola: "kilolitres of cola", sweets: "bags of sweets", toys: "crates of toys", fizzy: "crates of fizzy drinks", batteries: "crates of batteries",
};
export const cargoUnitLabel = (c: CargoKey) => CARGO_LABEL[c];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

interface Spec {
  name: string; type: VehicleType; cargo: CargoKey; year: number; speed: number; cap: number; price: number;
  run: number; rel: number; look: Look; life?: number; hp?: number; tons?: number; supported?: boolean; retire?: number;
}

function make(s: Spec): VehicleModel {
  const life = s.life ?? (s.type === "bus" || s.type === "truck" ? 15 : s.type === "locomotive" || s.type === "wagon" ? 28 : 22);
  return {
    id: slug(s.name), name: s.name, type: s.type, cargo: s.cargo,
    introYear: s.year, retiredYear: s.retire ?? s.year + 38,
    speedKmh: s.speed, capacity: s.cap, price: s.price, runningCostPerYear: s.run,
    maxAgeYears: life, baseReliability: s.rel, powerHp: s.hp, weightTons: s.tons,
    look: s.look, supported: s.supported ?? true,
  };
}

const L = (shape: Shape, body: string, accent: string, roof: string, trim = "#1a1a1a"): Look => ({ shape, body, accent, roof, trim });

// ------------------------------------------------------------------- buses

const BUSES: Spec[] = [
  { name: "Dunmore Minibus",        type: "bus", cargo: "passengers", year: 1950, speed: 70,  cap: 16, price: 2800,  run: 330,  rel: 0.74, look: L("minibus", "#e8d8a8", "#7a4a21", "#b5a070") },
  { name: "Marlow Regal",           type: "bus", cargo: "passengers", year: 1950, speed: 56,  cap: 31, price: 4200,  run: 426,  rel: 0.78, look: L("bus", "#b3382c", "#f0e6c8", "#8a2a20") },
  { name: "Hartford Stag",          type: "bus", cargo: "passengers", year: 1962, speed: 80,  cap: 35, price: 5100,  run: 570,  rel: 0.82, look: L("bus", "#2e6f9e", "#f4f1e6", "#1f4d70") },
  { name: "Pembroke Double-Decker", type: "bus", cargo: "passengers", year: 1966, speed: 72,  cap: 58, price: 7200,  run: 760,  rel: 0.80, look: L("doubledecker", "#c0392b", "#f6e7c1", "#8a2a20") },
  { name: "Bexley Metro",           type: "bus", cargo: "passengers", year: 1974, speed: 96,  cap: 37, price: 6000,  run: 690,  rel: 0.84, look: L("bus", "#e07b00", "#fafafa", "#a85a00") },
  { name: "Calder Cruiser",         type: "bus", cargo: "passengers", year: 1985, speed: 112, cap: 41, price: 7400,  run: 820,  rel: 0.86, look: L("bus", "#3f8f5a", "#f4f4f4", "#2c6a42") },
  { name: "Alton Articulated",      type: "bus", cargo: "passengers", year: 1992, speed: 104, cap: 66, price: 10500, run: 1050, rel: 0.85, look: L("artic", "#7b3fa0", "#f0f0f0", "#58287a") },
  { name: "Vale Grand Coach",       type: "bus", cargo: "passengers", year: 2000, speed: 128, cap: 48, price: 9200,  run: 960,  rel: 0.89, look: L("coach", "#e9e9ee", "#1e5aa8", "#c4c4cc") },
  { name: "Solent Electric",        type: "bus", cargo: "passengers", year: 2015, speed: 120, cap: 45, price: 11000, run: 700,  rel: 0.92, look: L("bus", "#12a39a", "#ffffff", "#0b7a73") },
];

// ------------------------------------------------------------------ trucks

interface TruckGen { mfr: string; year: number; speed: number; price: number; run: number; rel: number; accent: string }
const TRUCK_GENS: TruckGen[] = [
  { mfr: "Balmoral", year: 1950, speed: 48,  price: 4500, run: 430, rel: 0.76, accent: "#7a4a21" },
  { mfr: "Drayton",  year: 1972, speed: 80,  price: 5600, run: 600, rel: 0.82, accent: "#f1f1f1" },
  { mfr: "Karst",    year: 1995, speed: 112, price: 6900, run: 760, rel: 0.88, accent: "#ffb703" },
];
interface TruckFamily { cargo: CargoKey; label: string; shape: Shape; color: string; caps: [number, number, number]; offset: number; extra: number }
const TRUCK_FAMILIES: TruckFamily[] = [
  { cargo: "coal",  label: "Coal Truck",   shape: "tipper",      color: "#3b3f45", caps: [20, 24, 28], offset: 0, extra: 0 },
  { cargo: "grain", label: "Grain Truck",  shape: "hopperTruck", color: "#d6a82e", caps: [20, 24, 28], offset: 0, extra: 100 },
  { cargo: "goods", label: "Goods Van",    shape: "vanTruck",    color: "#2f6db5", caps: [14, 17, 20], offset: 0, extra: 200 },
  { cargo: "wood",  label: "Timber Truck", shape: "flatLogs",    color: "#3f7d3a", caps: [22, 26, 30], offset: 0, extra: 0 },
  { cargo: "steel", label: "Steel Truck",  shape: "flatCoils",   color: "#6b7785", caps: [18, 22, 26], offset: 0, extra: 300 },
  { cargo: "mail",  label: "Mail Van",     shape: "vanTruck",    color: "#c0392b", caps: [22, 26, 30], offset: 0, extra: 0 },
  { cargo: "oil",   label: "Oil Tanker",   shape: "tankTruck",   color: "#2b2b2e", caps: [21, 25, 29], offset: 0, extra: 200 },
  { cargo: "paper", label: "Paper Truck",  shape: "vanTruck",    color: "#e8e2cf", caps: [15, 18, 22], offset: 0, extra: 100 },
  { cargo: "food",  label: "Food Van",     shape: "vanTruck",    color: "#f2f2f2", caps: [17, 20, 24], offset: 0, extra: 200 },
  { cargo: "gold",  label: "Armoured Truck", shape: "vanTruck",  color: "#8a7a3a", caps: [6, 8, 10],   offset: 0, extra: 900 },
  { cargo: "rubber",label: "Rubber Tanker", shape: "tankTruck",  color: "#6b4a2b", caps: [20, 24, 28], offset: 0, extra: 100 },
  { cargo: "fruit", label: "Fruit Truck",  shape: "hopperTruck", color: "#e07b00", caps: [17, 20, 24], offset: 0, extra: 100 },
  { cargo: "water", label: "Water Tanker", shape: "tankTruck",   color: "#3a7fc2", caps: [21, 25, 29], offset: 0, extra: 100 },
  { cargo: "diamonds", label: "Diamond Van", shape: "vanTruck",  color: "#9fb7c9", caps: [6, 8, 10],   offset: 0, extra: 900 },
  { cargo: "sugar", label: "Sugar Truck",  shape: "hopperTruck", color: "#f3d6e6", caps: [20, 24, 28], offset: 0, extra: 0 },
  { cargo: "plastic", label: "Plastic Tanker", shape: "tankTruck", color: "#d83aa8", caps: [20, 24, 28], offset: 0, extra: 0 },
  { cargo: "cola",  label: "Cola Tanker",  shape: "tankTruck",   color: "#5a2a1a", caps: [21, 25, 29], offset: 0, extra: 0 },
  { cargo: "sweets", label: "Sweet Van",   shape: "vanTruck",    color: "#ff7ab8", caps: [15, 18, 22], offset: 0, extra: 0 },
  { cargo: "toys",  label: "Toy Van",      shape: "vanTruck",    color: "#7a4fd0", caps: [15, 18, 22], offset: 0, extra: 0 },
  { cargo: "fizzy", label: "Fizzy Drinks Truck", shape: "vanTruck", color: "#2fbf71", caps: [15, 18, 22], offset: 0, extra: 0 },
  { cargo: "batteries", label: "Battery Truck", shape: "vanTruck", color: "#f2c230", caps: [15, 18, 22], offset: 0, extra: 0 },
];

const TRUCKS: Spec[] = TRUCK_FAMILIES.flatMap(f =>
  TRUCK_GENS.map((g, i): Spec => ({
    name: `${g.mfr} ${f.label}`, type: "truck", cargo: f.cargo, year: g.year + f.offset,
    speed: g.speed, cap: f.caps[i], price: g.price + f.extra, run: g.run, rel: g.rel,
    look: L(f.shape, f.color, g.accent, "#222"),
  }))
);

// --------------------------------------------------------------- locomotives

const LOCOS: Spec[] = [
  { name: "Kestrel 0-6-0",   type: "locomotive", cargo: "goods", year: 1950, speed: 64,  cap: 0, price: 11000, run: 1100, rel: 0.72, hp: 400,  tons: 55,  look: L("steam", "#1d1d1f", "#b3382c", "#0e0e10"), retire: 1972 },
  { name: "Warbler 4-4-0",   type: "locomotive", cargo: "goods", year: 1956, speed: 88,  cap: 0, price: 14000, run: 1250, rel: 0.75, hp: 700,  tons: 70,  look: L("steam", "#1f3d2b", "#d9b34a", "#14281c"), retire: 1980 },
  { name: "Lancer 4-6-0",    type: "locomotive", cargo: "goods", year: 1964, speed: 112, cap: 0, price: 17500, run: 1450, rel: 0.78, hp: 950,  tons: 85,  look: L("steam", "#2a2f6b", "#e6e6e6", "#1a1d45"), retire: 1988 },
  { name: "Condor 4-6-2",    type: "locomotive", cargo: "goods", year: 1972, speed: 144, cap: 0, price: 22000, run: 1700, rel: 0.78, hp: 1300, tons: 100, look: L("steam", "#14507a", "#f0c040", "#0d3550"), retire: 1995 },
  { name: "Ironside D1",     type: "locomotive", cargo: "goods", year: 1958, speed: 96,  cap: 0, price: 15000, run: 1450, rel: 0.80, hp: 900,  tons: 72,  look: L("diesel", "#6b2d2d", "#e0c070", "#4a1f1f") },
  { name: "Mallard D3",      type: "locomotive", cargo: "goods", year: 1968, speed: 128, cap: 0, price: 19500, run: 1750, rel: 0.83, hp: 1700, tons: 90,  look: L("diesel", "#2f5d8a", "#f2f2f2", "#1f4160") },
  { name: "Falcon D5",       type: "locomotive", cargo: "goods", year: 1982, speed: 160, cap: 0, price: 26000, run: 2100, rel: 0.86, hp: 2800, tons: 100, look: L("diesel", "#e3a21a", "#2b2b2b", "#b57d10") },
  { name: "Atlas D8",        type: "locomotive", cargo: "goods", year: 1996, speed: 190, cap: 0, price: 33000, run: 2500, rel: 0.90, hp: 3800, tons: 110, look: L("diesel", "#2d7a4d", "#ffd23f", "#1d5535") },
  { name: "Volt E1",         type: "locomotive", cargo: "goods", year: 1972, speed: 144, cap: 0, price: 24000, run: 1500, rel: 0.85, hp: 2200, tons: 85,  look: L("electric", "#1f6f6b", "#f5f5f5", "#154a47") },
  { name: "Arc E3",          type: "locomotive", cargo: "goods", year: 1984, speed: 176, cap: 0, price: 31000, run: 1800, rel: 0.88, hp: 3800, tons: 90,  look: L("electric", "#b32a2a", "#f5f5f5", "#7d1d1d") },
  { name: "Meridian E5",     type: "locomotive", cargo: "goods", year: 1998, speed: 224, cap: 0, price: 41000, run: 2300, rel: 0.91, hp: 5200, tons: 95,  look: L("fast",     "#e8eaf0", "#d62828", "#b4b8c4") },
  { name: "Tempest E7",      type: "locomotive", cargo: "goods", year: 2012, speed: 288, cap: 0, price: 56000, run: 2900, rel: 0.94, hp: 6800, tons: 100, look: L("fast",     "#f4f4f6", "#1d6fd1", "#c8ccd6") },
];

// ------------------------------------------------------------------- wagons

interface WagonGen { year: number; speed: number; price: number; run: number; rel: number; tag: string }
const WAGON_GENS: WagonGen[] = [
  { year: 1950, speed: 112, price: 1600, run: 110, rel: 0.80, tag: "1" },
  { year: 1972, speed: 160, price: 2100, run: 140, rel: 0.85, tag: "2" },
  { year: 1995, speed: 210, price: 2800, run: 180, rel: 0.90, tag: "3" },
];
interface WagonFamily { cargo: CargoKey; names: [string, string, string]; shape: Shape; colors: [string, string, string]; caps: [number, number, number]; tons: [number, number, number] }
const WAGON_FAMILIES: WagonFamily[] = [
  { cargo: "passengers", names: ["Compartment Coach", "Intercity Coach", "Panorama Coach"], shape: "paxCar", colors: ["#7a2e2e", "#2f5d8a", "#e8eaf0"], caps: [30, 38, 46], tons: [32, 36, 40] },
  { cargo: "mail",       names: ["Postal Van", "Sorting Van", "Express Mail Van"],          shape: "mailVan", colors: ["#a83232", "#b32a2a", "#c42d2d"], caps: [22, 28, 36], tons: [28, 32, 38] },
  { cargo: "coal",       names: ["Open Coal Wagon", "Bogie Coal Hopper", "Merry-Go-Round Hopper"], shape: "openHopper", colors: ["#4a4a4f", "#3a3a40", "#2c2c32"], caps: [20, 26, 34], tons: [28, 36, 46] },
  { cargo: "goods",      names: ["Goods Van", "Covered Goods Wagon", "Container Wagon"],     shape: "boxVan", colors: ["#7a5a3a", "#3f6d9a", "#d89a2b"], caps: [15, 20, 26], tons: [22, 28, 34] },
  { cargo: "wood",       names: ["Timber Wagon", "Log Bogie Wagon", "Timber Carrier"],       shape: "logWagon", colors: ["#6b5a3a", "#4a6b3a", "#3a5a45"], caps: [20, 26, 32], tons: [26, 34, 42] },
  { cargo: "grain",      names: ["Grain Wagon", "Grain Hopper", "Cereal Silo Wagon"],        shape: "grainHopper", colors: ["#b59a4a", "#c9a93a", "#e0c050"], caps: [20, 26, 32], tons: [26, 34, 42] },
  { cargo: "steel",      names: ["Steel Plate Wagon", "Coil Wagon", "Heavy Steel Carrier"],  shape: "coilWagon", colors: ["#5a6470", "#4a5563", "#3b4452"], caps: [20, 26, 32], tons: [30, 38, 46] },
  { cargo: "oil",      names: ["Oil Tank Wagon", "Bogie Oil Tanker", "Petroleum Tanker"], shape: "tankWagon", colors: ["#2b2b2e", "#3a3a40", "#1e1e22"], caps: [21, 28, 34], tons: [12, 15, 17] },
  { cargo: "paper",    names: ["Paper Van", "Paper Bogie Van", "Paper Container Wagon"], shape: "boxVan", colors: ["#d9d2b8", "#e8e2cf", "#cfc6a8"], caps: [15, 20, 26], tons: [11, 13, 15] },
  { cargo: "food",     names: ["Refrigerated Van", "Food Bogie Van", "Reefer Container Wagon"], shape: "boxVan", colors: ["#f2f2f2", "#e6eef5", "#ffffff"], caps: [15, 20, 26], tons: [12, 14, 16] },
  { cargo: "gold",     names: ["Armoured Van", "Bullion Van", "Secure Container Wagon"], shape: "boxVan", colors: ["#8a7a3a", "#7a6a2a", "#6a5a1a"], caps: [8, 10, 12], tons: [12, 14, 16] },
  { cargo: "rubber",   names: ["Rubber Tank Wagon", "Latex Tanker", "Rubber Bogie Tanker"], shape: "tankWagon", colors: ["#6b4a2b", "#5a3a20", "#7a5a3a"], caps: [20, 26, 32], tons: [12, 15, 17] },
  { cargo: "fruit",    names: ["Fruit Van", "Fruit Bogie Van", "Fruit Container Wagon"], shape: "grainHopper", colors: ["#e07b00", "#f09a20", "#d06a00"], caps: [18, 24, 30], tons: [11, 13, 15] },
  { cargo: "water",    names: ["Water Tank Wagon", "Bogie Water Tanker", "Water Carrier"], shape: "tankWagon", colors: ["#3a7fc2", "#2f6db5", "#4a8fd2"], caps: [21, 28, 34], tons: [12, 15, 17] },
  { cargo: "diamonds", names: ["Diamond Van", "Gem Van", "Secure Gem Wagon"], shape: "boxVan", colors: ["#9fb7c9", "#8fa7b9", "#afc7d9"], caps: [8, 10, 12], tons: [12, 14, 16] },
  { cargo: "sugar",    names: ["Sugar Hopper", "Candy Hopper", "Sugar Bogie Hopper"], shape: "grainHopper", colors: ["#f3d6e6", "#f7c6de", "#efb6d6"], caps: [20, 26, 32], tons: [11, 13, 15] },
  { cargo: "plastic",  names: ["Plastic Tanker", "Bogie Plastic Tanker", "Plastic Carrier"], shape: "tankWagon", colors: ["#d83aa8", "#c82a98", "#e84ab8"], caps: [20, 26, 32], tons: [12, 15, 17] },
  { cargo: "cola",     names: ["Cola Tanker", "Bogie Cola Tanker", "Cola Carrier"], shape: "tankWagon", colors: ["#5a2a1a", "#4a1a0a", "#6a3a2a"], caps: [21, 28, 34], tons: [12, 15, 17] },
  { cargo: "sweets",   names: ["Sweet Van", "Candy Van", "Sweet Container Wagon"], shape: "boxVan", colors: ["#ff7ab8", "#ff5aa8", "#ff9ac8"], caps: [15, 20, 26], tons: [11, 13, 15] },
  { cargo: "toys",     names: ["Toy Van", "Toy Bogie Van", "Toy Container Wagon"], shape: "boxVan", colors: ["#7a4fd0", "#6a3fc0", "#8a5fe0"], caps: [15, 20, 26], tons: [11, 13, 15] },
  { cargo: "fizzy",    names: ["Fizzy Drinks Van", "Fizzy Bogie Van", "Fizzy Container Wagon"], shape: "boxVan", colors: ["#2fbf71", "#1faf61", "#3fcf81"], caps: [15, 20, 26], tons: [11, 13, 15] },
  { cargo: "batteries", names: ["Battery Van", "Battery Bogie Van", "Battery Container Wagon"], shape: "boxVan", colors: ["#f2c230", "#e2b220", "#ffd240"], caps: [15, 20, 26], tons: [11, 13, 15] },
];
const WAGONS: Spec[] = WAGON_FAMILIES.flatMap(f =>
  WAGON_GENS.map((g, i): Spec => ({
    name: f.names[i], type: "wagon", cargo: f.cargo, year: g.year, speed: g.speed, cap: f.caps[i],
    price: g.price + (f.cargo === "passengers" ? 400 : 0), run: g.run, rel: g.rel, tons: f.tons[i],
    look: L(f.shape, f.colors[i], i === 0 ? "#d9d2b8" : i === 1 ? "#f0f0f0" : "#ffb703", "#222"),
  }))
);

// ------------------------------------------------------- ships and aircraft

const OTHER: Spec[] = [
  { name: "Tern Ferry",         type: "ship", cargo: "passengers", year: 1950, speed: 28,  cap: 60,  price: 18000, run: 1500, rel: 0.78, look: L("ferry", "#f2f2f2", "#1e5aa8", "#c9c9c9") },
  { name: "Cormorant Freighter",type: "ship", cargo: "goods",      year: 1950, speed: 24,  cap: 90,  price: 22000, run: 1800, rel: 0.76, look: L("cargoShip", "#3a4a5c", "#b3382c", "#26323f") },
  { name: "Puffin Bulk Carrier",type: "ship", cargo: "coal",       year: 1950, speed: 24,  cap: 120, price: 24000, run: 1900, rel: 0.76, look: L("bulkShip", "#4a3a2c", "#d6a82e", "#2c241a") },
  { name: "Pelican Oil Tanker", type: "ship", cargo: "oil",        year: 1950, speed: 26,  cap: 140, price: 26000, run: 2000, rel: 0.77, look: L("tanker", "#8a2c2c", "#f2f2f2", "#5a1c1c") },
  { name: "Gannet Hydrofoil",   type: "ship", cargo: "passengers", year: 1985, speed: 70,  cap: 90,  price: 36000, run: 2600, rel: 0.86, look: L("ferry", "#e8f1fa", "#d62828", "#b7c6d6") },
  { name: "Skua Supertanker",   type: "ship", cargo: "oil",        year: 1980, speed: 34,  cap: 300, price: 52000, run: 3600, rel: 0.85, look: L("tanker", "#1f3a5a", "#f2f2f2", "#12243a") },
  { name: "Sparrow Prop",       type: "aircraft", cargo: "passengers", year: 1955, speed: 240,  cap: 20,  price: 30000, run: 2200, rel: 0.74, look: L("propPlane", "#d9d9d9", "#b3382c", "#a8a8a8") },
  { name: "Wren Mailplane",     type: "aircraft", cargo: "mail",       year: 1958, speed: 260,  cap: 30,  price: 32000, run: 2300, rel: 0.75, look: L("propPlane", "#c0392b", "#f4c542", "#8a2a20") },
  { name: "Heron Airliner",     type: "aircraft", cargo: "passengers", year: 1970, speed: 600,  cap: 70,  price: 80000, run: 4200, rel: 0.82, look: L("jet", "#f4f4f4", "#1e5aa8", "#c8c8c8") },
  { name: "Osprey Freight Jet", type: "aircraft", cargo: "goods",      year: 1982, speed: 700,  cap: 60,  price: 95000, run: 4800, rel: 0.85, look: L("jet", "#d89a2b", "#2b2b2b", "#a87a1f") },
  { name: "Albatross Jumbo",    type: "aircraft", cargo: "passengers", year: 1995, speed: 900,  cap: 180, price: 160000, run: 7200, rel: 0.90, look: L("jet", "#ffffff", "#0b6e4f", "#d0d0d0") },
];

const built = [...BUSES, ...TRUCKS, ...LOCOS, ...WAGONS, ...OTHER].map(make);

// The newest model in each family never retires, so there is always something to buy.
// Steam locomotives are left out on purpose: they do retire, like in the original.
const newest = new Map<string, VehicleModel>();
for (const m of built) {
  const shape = m.look.shape;
  const key = m.type === "locomotive"
    ? (shape === "steam" ? null : shape === "diesel" ? "loco:diesel" : "loco:electric")
    : `${m.type}:${m.cargo}`;
  if (!key) continue;
  const cur = newest.get(key);
  if (!cur || m.introYear > cur.introYear) newest.set(key, m);
}
newest.forEach(m => { m.retiredYear = 9999; });

export const MODELS: VehicleModel[] = built;

// ------------------------------------------------------------------ queries

/** Models you can buy in a given year. Pass a type to filter ("bus", "truck", "locomotive", "wagon", ...). */
export function availableModels(year: number, type?: VehicleType): VehicleModel[] {
  return MODELS.filter(m => !m.composite && m.introYear <= year && year < m.retiredYear && (!type || m.type === type));
}

/** Look a model up by id. Also understands train ids like "consist:kestrel-0-6-0:open-coal-wagon:6". */
export function getModel(id: string): VehicleModel | undefined {
  const found = MODELS.find(m => m.id === id);
  if (found) return found;
  const parts = /^consist:([^:]+):([^:]+):(\d+)$/.exec(id);
  if (!parts) return undefined;
  return makeTrainModel(parts[1], parts[2], parseInt(parts[3], 10));
}

// ------------------------------------------------------------------- trains

export const MAX_WAGONS = 20;

/** How many wagons this locomotive can pull. More power or lighter wagons = longer train. */
export function maxWagons(loco: VehicleModel, wagon: VehicleModel): number {
  const need = (wagon.weightTons ?? 30) * 2.2;
  return Math.max(1, Math.min(MAX_WAGONS, Math.floor((loco.powerHp ?? 400) / need)));
}

export interface ConsistStats {
  ok: boolean;
  n: number;
  maxN: number;
  speedKmh: number;
  capacity: number;
  price: number;
  runningCostPerYear: number;
  warnings: string[];
}

export function consistStats(locoId: string, wagonId: string, wagons: number): ConsistStats {
  const loco = MODELS.find(m => m.id === locoId), wagon = MODELS.find(m => m.id === wagonId);
  if (!loco || !wagon || loco.type !== "locomotive" || wagon.type !== "wagon") {
    return { ok: false, n: 0, maxN: 0, speedKmh: 0, capacity: 0, price: 0, runningCostPerYear: 0, warnings: ["Pick a locomotive and a wagon."] };
  }
  const maxN = maxWagons(loco, wagon);
  const n = Math.max(1, Math.min(wagons, maxN));
  const warnings: string[] = [];
  if (wagons > maxN) warnings.push(`This locomotive can only pull ${maxN} of these wagons.`);
  if (wagon.speedKmh < loco.speedKmh) warnings.push(`The wagons limit the train to ${wagon.speedKmh} km/h.`);
  return {
    ok: true, n, maxN,
    speedKmh: Math.min(loco.speedKmh, wagon.speedKmh),
    capacity: n * wagon.capacity,
    price: loco.price + n * wagon.price,
    runningCostPerYear: loco.runningCostPerYear + Math.round(n * wagon.runningCostPerYear * 0.8),
    warnings,
  };
}

export const consistId = (locoId: string, wagonId: string, n: number) => `consist:${locoId}:${wagonId}:${n}`;

function makeTrainModel(locoId: string, wagonId: string, wagons: number): VehicleModel | undefined {
  const loco = MODELS.find(m => m.id === locoId), wagon = MODELS.find(m => m.id === wagonId);
  if (!loco || !wagon) return undefined;
  const st = consistStats(locoId, wagonId, wagons);
  if (!st.ok) return undefined;
  const id = consistId(locoId, wagonId, st.n);
  const existing = MODELS.find(m => m.id === id);
  if (existing) return existing;
  const model: VehicleModel = {
    id, name: `${loco.name} + ${st.n} x ${wagon.name}`, type: "train", cargo: wagon.cargo,
    introYear: Math.max(loco.introYear, wagon.introYear), retiredYear: 9999,
    speedKmh: st.speedKmh, capacity: st.capacity, price: st.price, runningCostPerYear: st.runningCostPerYear,
    maxAgeYears: loco.maxAgeYears, baseReliability: loco.baseReliability, powerHp: loco.powerHp,
    look: loco.look, supported: true, composite: true, parts: { locoId, wagonId, n: st.n },
  };
  MODELS.push(model);        // so MODELS.find(id) works for every vehicle in the game
  return model;
}

/** Build (or fetch) the model for a locomotive + wagons train. Use its id on the new Vehicle. */
export function buildTrainModel(locoId: string, wagonId: string, wagons: number): VehicleModel | undefined {
  return makeTrainModel(locoId, wagonId, wagons);
}

// ------------------------------------------------------------------ sprites

const GLASS = "#bfe3ff", DARK = "#1a1a1a", TYRE = "#1c1c1c", HUB = "#9aa0a6";

const wheel = (cx: number, r = 5, cy = 42) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TYRE}"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.45).toFixed(1)}" fill="${HUB}"/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, stroke = DARK) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
const poly = (pts: string, fill: string, stroke = DARK) =>
  `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>`;
const windows = (x0: number, x1: number, y: number, h: number, count: number, fill = GLASS) => {
  const gap = 2, w = (x1 - x0 - gap * (count - 1)) / count;
  let s = "";
  for (let i = 0; i < count; i++) s += `<rect x="${(x0 + i * (w + gap)).toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="1" fill="${fill}" stroke="${DARK}" stroke-width=".8"/>`;
  return s;
};

interface Drawn { w: number; inner: string }

function truckCab(look: Look, x: number): string {
  return rect(x, 18, 30, 22, look.body, 3) + rect(x + 14, 21, 13, 10, GLASS, 2) + rect(x + 26, 32, 5, 6, "#f5e6a0", 1)
    + rect(x, 36, 34, 4, look.accent, 1);
}
function truckChassis(): string {
  return rect(4, 36, 108, 5, "#2a2a2a", 1) + wheel(20) + wheel(35) + wheel(92);
}

function draw(look: Look): Drawn {
  const { body, accent, roof } = look;
  switch (look.shape) {
    case "minibus":
      return { w: 66, inner: rect(4, 20, 56, 20, body, 5) + rect(4, 20, 56, 4, roof, 2) + windows(9, 44, 25, 8, 4) + rect(46, 25, 11, 9, GLASS, 2)
        + rect(4, 34, 56, 3, accent) + wheel(18) + wheel(46) + `<circle cx="59" cy="35" r="2" fill="#f5e6a0"/>` };
    case "bus":
      return { w: 106, inner: rect(4, 16, 98, 24, body, 5) + rect(4, 16, 98, 4, roof, 2) + windows(10, 80, 22, 9, 7) + rect(84, 22, 14, 13, GLASS, 2)
        + rect(4, 33, 98, 3, accent) + wheel(26) + wheel(80) + `<circle cx="100" cy="36" r="2" fill="#f5e6a0"/>` };
    case "doubledecker":
      return { w: 98, inner: rect(4, 6, 90, 34, body, 4) + rect(4, 6, 90, 4, roof, 2) + windows(9, 76, 12, 8, 6) + windows(9, 76, 25, 8, 6)
        + rect(4, 21, 90, 2.5, accent) + rect(78, 12, 12, 8, GLASS, 1) + rect(78, 25, 12, 12, GLASS, 1) + wheel(22) + wheel(72) };
    case "artic":
      return { w: 142, inner: rect(4, 16, 70, 24, body, 4) + rect(4, 16, 70, 4, roof, 2) + windows(9, 68, 22, 9, 6)
        + rect(74, 21, 9, 17, "#2b2b2b", 2) + rect(83, 16, 56, 24, body, 4) + rect(83, 16, 56, 4, roof, 2) + windows(88, 124, 22, 9, 4)
        + rect(126, 22, 11, 13, GLASS, 2) + rect(4, 33, 135, 3, accent) + wheel(20) + wheel(56) + wheel(112) };
    case "coach":
      return { w: 110, inner: rect(4, 14, 102, 26, body, 7) + rect(40, 10, 32, 5, roof, 2) + rect(10, 18, 88, 10, "#1d3b57", 3)
        + rect(4, 31, 102, 4, accent) + rect(14, 36, 14, 4, "#222", 1) + wheel(26) + wheel(84) + `<circle cx="104" cy="34" r="2" fill="#f5e6a0"/>` };
    case "tipper":
      return { w: 116, inner: truckChassis() + poly("6,18 74,18 72,36 8,36", body) + rect(8, 12, 64, 7, "#111", 3) + `<path d="M12 12 Q40 4 68 12" fill="#111" stroke="${DARK}" stroke-width="1"/>`
        + rect(6, 25, 68, 3, accent) + truckCab(look, 78) };
    case "vanTruck":
      return { w: 116, inner: truckChassis() + rect(4, 8, 72, 29, body, 3) + rect(4, 8, 72, 4, look.roof, 2) + rect(4, 27, 72, 4, accent)
        + rect(60, 13, 12, 20, "rgba(0,0,0,.18)", 1, DARK) + truckCab(look, 78) };
    case "flatLogs":
      return { w: 116, inner: truckChassis() + rect(4, 32, 74, 5, "#5b4a3a", 1) + rect(8, 24, 66, 7, "#8a5a2b", 3) + rect(10, 17, 62, 7, "#9a6a35", 3) + rect(14, 10, 54, 7, "#8a5a2b", 3)
        + rect(4, 8, 3, 25, "#3a3a3a") + rect(75, 8, 3, 25, "#3a3a3a") + `<circle cx="73" cy="27.5" r="3" fill="#c79a5c"/>` + truckCab(look, 80) };
    case "flatCoils":
      return { w: 116, inner: truckChassis() + rect(4, 32, 74, 5, "#4a4f57", 1)
        + [20, 42, 64].map(x => `<circle cx="${x}" cy="22" r="10" fill="#a9b4c0" stroke="${DARK}" stroke-width="1.2"/><circle cx="${x}" cy="22" r="4" fill="#3b4350"/>`).join("")
        + truckCab(look, 80) };
    case "hopperTruck":
      return { w: 116, inner: truckChassis() + rect(6, 8, 68, 22, body, 10) + poly("14,30 66,30 56,37 24,37", body) + rect(18, 4, 10, 5, roof, 2) + rect(46, 4, 10, 5, roof, 2)
        + rect(6, 18, 68, 3, accent) + truckCab(look, 78) };
    case "steam":
      return { w: 106, inner: poly("92,40 102,45 92,45", "#555") + rect(26, 17, 60, 19, body, 9) + rect(80, 17, 10, 19, "#2b2b2b", 3)
        + poly("80,6 90,6 88,17 82,17", "#111") + `<circle cx="56" cy="15" r="5" fill="${accent}" stroke="${DARK}" stroke-width="1.2"/>`
        + `<circle cx="86" cy="2" r="4" fill="#fff" opacity=".8"/><circle cx="92" cy="-2" r="3" fill="#fff" opacity=".6"/>`
        + rect(6, 9, 22, 28, accent, 2) + rect(4, 6, 26, 4, roof, 1) + rect(11, 13, 9, 9, GLASS, 1) + rect(26, 28, 60, 3, accent)
        + rect(6, 36, 82, 3, "#2a2a2a") + wheel(40, 7, 38) + wheel(56, 7, 38) + wheel(72, 7, 38) + wheel(86, 4, 41)
        + `<line x1="40" y1="38" x2="72" y2="38" stroke="#bbb" stroke-width="2"/>` };
    case "diesel":
      return { w: 110, inner: rect(4, 14, 102, 26, body, 4) + rect(4, 12, 102, 3, roof, 1) + rect(8, 20, 16, 14, "#222", 1)
        + `<path d="M10 23H22M10 26H22M10 29H22M10 32H22" stroke="#777" stroke-width="1"/>` + windows(30, 62, 20, 9, 3) + rect(88, 18, 14, 11, GLASS, 2)
        + rect(4, 32, 102, 4, accent) + rect(38, 40, 28, 4, "#333", 1) + wheel(20, 5) + wheel(34, 5) + wheel(76, 5) + wheel(90, 5)
        + `<circle cx="104" cy="30" r="2" fill="#f5e6a0"/>` };
    case "electric":
      return { w: 110, inner: `<path d="M38 14 L50 4 L62 14" fill="none" stroke="#222" stroke-width="2"/><rect x="43" y="2" width="14" height="3" fill="#222"/>`
        + rect(4, 14, 102, 26, body, 6) + rect(4, 12, 102, 3, roof, 1) + windows(12, 56, 20, 9, 4) + rect(86, 18, 16, 12, GLASS, 3)
        + rect(4, 32, 102, 4, accent) + wheel(20, 5) + wheel(34, 5) + wheel(76, 5) + wheel(90, 5) + `<circle cx="104" cy="32" r="2" fill="#f5e6a0"/>` };
    case "fast":
      return { w: 130, inner: `<path d="M44 16 L54 6 L64 16" fill="none" stroke="#222" stroke-width="2"/>`
        + poly("4,14 98,14 126,30 126,40 4,40", body) + rect(4, 32, 120, 4, accent) + windows(10, 78, 19, 8, 6, "#1d3b57")
        + poly("100,17 114,26 100,26", "#1d3b57") + wheel(22, 5) + wheel(38, 5) + wheel(88, 5) + wheel(104, 5) + `<circle cx="123" cy="35" r="2" fill="#fff"/>` };
    case "paxCar":
      return { w: 86, inner: rect(4, 14, 78, 26, body, 4) + rect(4, 12, 78, 3, roof, 1) + windows(9, 76, 19, 9, 6) + rect(4, 32, 78, 3, accent) + rect(36, 28, 8, 10, "rgba(0,0,0,.25)", 1) + wheel(18, 4.5) + wheel(68, 4.5) };
    case "mailVan":
      return { w: 86, inner: rect(4, 14, 78, 26, body, 3) + rect(4, 12, 78, 3, roof, 1) + rect(30, 18, 26, 20, "rgba(0,0,0,.22)", 1) + rect(34, 22, 18, 10, "#f4e6a0", 1)
        + `<path d="M34 22 L43 28 L52 22" fill="none" stroke="${DARK}" stroke-width="1"/>` + rect(4, 33, 78, 3, "#f4c542") + wheel(18, 4.5) + wheel(68, 4.5) };
    case "openHopper":
      return { w: 86, inner: poly("4,16 82,16 78,38 8,38", body) + `<path d="M8 16 Q43 4 78 16Z" fill="#111" stroke="${DARK}" stroke-width="1"/>`
        + `<path d="M22 16V38M40 16V38M58 16V38" stroke="${DARK}" stroke-width="1" opacity=".5"/>` + rect(8, 30, 70, 3, accent) + wheel(18, 4.5) + wheel(68, 4.5) };
    case "boxVan":
      return { w: 86, inner: rect(4, 12, 78, 28, body, 2) + rect(4, 10, 78, 3, roof, 1) + rect(30, 15, 26, 22, "rgba(0,0,0,.2)", 1)
        + `<path d="M10 16V38M18 16V38M64 16V38M72 16V38" stroke="${DARK}" stroke-width=".8" opacity=".5"/>` + rect(4, 33, 78, 3, accent) + wheel(18, 4.5) + wheel(68, 4.5) };
    case "logWagon":
      return { w: 86, inner: rect(4, 34, 78, 5, "#4a4a4a", 1) + rect(8, 27, 70, 7, "#8a5a2b", 3) + rect(10, 20, 66, 7, "#9a6a35", 3) + rect(14, 13, 58, 7, "#8a5a2b", 3)
        + rect(4, 12, 3, 24, "#333") + rect(79, 12, 3, 24, "#333") + wheel(18, 4.5) + wheel(68, 4.5) };
    case "grainHopper":
      return { w: 86, inner: rect(4, 12, 78, 22, body, 8) + poly("12,34 74,34 64,40 22,40", body) + rect(16, 8, 10, 5, roof, 2) + rect(58, 8, 10, 5, roof, 2)
        + rect(4, 22, 78, 3, accent) + wheel(18, 4.5) + wheel(68, 4.5) };
    case "coilWagon":
      return { w: 86, inner: rect(4, 34, 78, 5, "#4a4f57", 1)
        + [22, 43, 64].map(x => `<circle cx="${x}" cy="24" r="10" fill="#a9b4c0" stroke="${DARK}" stroke-width="1.2"/><circle cx="${x}" cy="24" r="4" fill="#3b4350"/>`).join("")
        + wheel(18, 4.5) + wheel(68, 4.5) };
    case "ferry":
      return { w: 126, inner: poly("4,32 122,32 108,45 18,45", accent) + rect(14, 22, 98, 10, body, 2) + windows(18, 100, 25, 4, 10) + rect(34, 12, 56, 10, body, 2) + windows(38, 86, 15, 4, 7)
        + rect(56, 3, 10, 9, accent, 1) + `<path d="M0 46 Q10 43 20 46 T40 46 T60 46 T80 46 T100 46 T126 46" fill="none" stroke="#7fb4e6" stroke-width="2"/>` };
    case "cargoShip":
      return { w: 126, inner: poly("4,34 122,34 108,45 18,45", body) + rect(8, 18, 22, 16, accent, 1) + rect(12, 12, 14, 7, "#ddd", 1)
        + [38, 62, 86].map((x, i) => rect(x, 22, 22, 12, ["#b3382c", "#d6a82e", "#2f6db5"][i], 1) + rect(x + 2, 12, 18, 10, ["#2f6db5", "#b3382c", "#d6a82e"][i], 1)).join("")
        + `<path d="M0 46 Q10 43 20 46 T40 46 T60 46 T80 46 T100 46 T126 46" fill="none" stroke="#7fb4e6" stroke-width="2"/>` };
    case "propPlane":
      return { w: 120, inner: `<ellipse cx="58" cy="26" rx="48" ry="9" fill="${body}" stroke="${DARK}" stroke-width="1.2"/>` + poly("10,26 2,10 16,10 24,22", accent) + poly("44,26 66,26 74,38 52,38", roof)
        + windows(40, 88, 22, 5, 7) + `<rect x="104" y="14" width="3" height="24" fill="#555"/><circle cx="104" cy="26" r="3" fill="#444"/>` + wheel(60, 3, 42) + `<path d="M60 36V42" stroke="#444" stroke-width="2"/>` };
    case "tankTruck":
      return { w: 116, inner: truckChassis() + `<rect x="6" y="10" width="68" height="25" rx="12" fill="${body}" stroke="${DARK}" stroke-width="1.2"/>` + rect(6, 21, 68, 3, accent) + rect(30, 6, 12, 5, roof, 2) + truckCab(look, 78) };
    case "tankWagon":
      return { w: 86, inner: rect(4, 34, 78, 5, "#3a3a3a", 1) + `<rect x="6" y="12" width="74" height="23" rx="11" fill="${body}" stroke="${DARK}" stroke-width="1.2"/>` + rect(6, 22, 74, 3, accent) + rect(36, 7, 12, 6, roof, 2) + wheel(18, 4.5) + wheel(68, 4.5) };
    case "tanker":
      return { w: 126, inner: poly("4,30 122,30 110,45 14,45", body) + rect(10, 14, 20, 16, "#eee", 1) + rect(14, 8, 12, 7, accent, 1)
        + [36, 60, 84].map(x => `<rect x="${x}" y="22" width="20" height="8" rx="3" fill="${roof}" stroke="${DARK}" stroke-width="1"/>`).join("") + rect(34, 28, 80, 2, accent)
        + `<path d="M0 46 Q10 43 20 46 T40 46 T60 46 T80 46 T100 46 T126 46" fill="none" stroke="#7fb4e6" stroke-width="2"/>` };
    case "bulkShip":
      return { w: 126, inner: poly("4,30 122,30 110,45 14,45", body) + rect(98, 14, 18, 16, "#eee", 1) + rect(102, 8, 10, 7, roof, 1)
        + [12, 40, 68].map(x => rect(x, 22, 24, 8, accent, 1) + `<path d="M${x + 2} 22 Q${x + 12} 14 ${x + 22} 22Z" fill="#2b2b2e"/>`).join("")
        + `<path d="M0 46 Q10 43 20 46 T40 46 T60 46 T80 46 T100 46 T126 46" fill="none" stroke="#7fb4e6" stroke-width="2"/>` };
    case "jet":
      return { w: 130, inner: `<ellipse cx="62" cy="24" rx="56" ry="9" fill="${body}" stroke="${DARK}" stroke-width="1.2"/>` + poly("8,24 0,4 16,4 28,20", accent) + poly("46,26 76,26 92,40 64,40", roof)
        + `<ellipse cx="68" cy="36" rx="9" ry="4" fill="${roof}" stroke="${DARK}" stroke-width="1.2"/>` + windows(40, 104, 19, 4, 11) + rect(108, 22, 12, 4, GLASS, 1) + wheel(62, 3, 44) };
  }
}

function frame(w: number, inner: string, heightPx: number): string {
  const vw = w + 8;
  const px = Math.round((heightPx * vw) / 52);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 ${vw} 58" width="${px}" height="${heightPx}">`
    + `<ellipse cx="${w / 2}" cy="46" rx="${(w / 2).toFixed(1)}" ry="3" fill="rgba(0,0,0,.22)"/>${inner}</svg>`;
}

/** An SVG string for one model (side view, facing right). Use as innerHTML or an <img> data URL. */
export function vehicleSvg(model: Pick<VehicleModel, "look" | "type" | "parts">, heightPx = 56): string {
  if (model.type === "train" && model.parts) return trainSvg(model.parts.locoId, model.parts.wagonId, model.parts.n, heightPx);
  const d = draw(model.look);
  return frame(d.w, d.inner, heightPx);
}

/** A whole train: locomotive and wagons coupled. Shows at most 8 wagons. */
export function trainSvg(locoId: string, wagonId: string, wagons: number, heightPx = 56): string {
  const loco = MODELS.find(m => m.id === locoId), wagon = MODELS.find(m => m.id === wagonId);
  if (!loco || !wagon) return "";
  const shown = Math.max(0, Math.min(wagons, 8));
  const pieces: Drawn[] = [draw(loco.look), ...Array.from({ length: shown }, () => draw(wagon.look))];
  // Locomotive faces right, so wagons go to its left. Draw left to right with the loco last.
  const ordered = [...pieces.slice(1), pieces[0]];
  let x = 0, out = "";
  for (const p of ordered) {
    out += `<g transform="translate(${x},0)">${p.inner}</g>`;
    x += p.w - 2;
    out += `<rect x="${x - 4}" y="38" width="4" height="2" fill="#333"/>`;
  }
  return frame(x + 2, out, heightPx);
}

/** A short line for the shop: "31 passengers", "20 tonnes of coal". */
export function capacityText(m: Pick<VehicleModel, "capacity" | "cargo" | "type">): string {
  if (m.type === "locomotive") return "none (pulls wagons)";
  return `${m.capacity} ${cargoUnitLabel(m.cargo)}`;
}
