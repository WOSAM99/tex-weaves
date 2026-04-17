import {
  pgTable,
  integer,
  text,
  real,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const qualityMaster = pgTable("quality_master", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  ppi: integer("ppi").notNull(),
  warpPagar: real("warp_pagar").default(0),
  pasarPagar: real("pasar_pagar").default(0),
  mendingPagar: real("mending_pagar").default(0),
  tfoPagarMonthly: real("tfo_pagar_monthly").default(0),
});

export const machineMaster = pgTable("machine_master", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  machineNo: integer("machine_no").notNull().unique(),
  trueRpm: integer("true_rpm").notNull(),
});

export const beam = pgTable("beam", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  beamNo: text("beam_no").notNull().unique(),
  qualityId: integer("quality_id")
    .notNull()
    .references(() => qualityMaster.id),
  warpMeter: integer("warp_meter").notNull(),
  dateCreated: text("date_created").notNull(), // YYYY-MM-DD
  status: text("status")
    .notNull()
    .default("IN_STOCK"), // IN_STOCK | ACTIVE | COMPLETED | JOBWORK_SENT | JOBWORK_RECEIVED
  loadingDate: text("loading_date"),
  loadingShift: text("loading_shift"), // DAY | NIGHT
  machineNo: integer("machine_no").references(() => machineMaster.machineNo),
  bhidanDate: text("bhidan_date"),
  bhidanShift: text("bhidan_shift"),
  isJobwork: integer("is_jobwork").default(0), // 0 or 1
  jobParty: text("job_party"),
});

export const shiftLog = pgTable("shift_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date").notNull(), // YYYY-MM-DD
  shift: text("shift").notNull(), // DAY | NIGHT
  machineNo: integer("machine_no")
    .notNull()
    .references(() => machineMaster.machineNo),
  qualityId: integer("quality_id")
    .notNull()
    .references(() => qualityMaster.id),
  powerTime: real("power_time").notNull(),
  runTime: real("run_time").notNull(),
  stops: integer("stops").default(0),
  runRpm: integer("run_rpm").notNull(),
  runMins: integer("run_mins").notNull(),
  actualEfficiency: real("actual_efficiency").notNull(),
  productionMeters: real("production_meters").notNull(),
  trueProductionMeters: real("true_production_meters").notNull(),
});

export const shiftLogAudit = pgTable("shift_log_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shiftLogId: integer("shift_log_id")
    .notNull()
    .references(() => shiftLog.id),
  changedBy: text("changed_by").default("admin"),
  changedAt: timestamp("changed_at").defaultNow(),
  oldValueJson: text("old_value_json").notNull(),
  newValueJson: text("new_value_json").notNull(),
});

export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key] })]
);

export const jobworkParty = pgTable("jobwork_party", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  contact: text("contact"),
});

export const jobworkSent = pgTable("jobwork_sent", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id")
    .notNull()
    .references(() => jobworkParty.id),
  beamId: integer("beam_id").references(() => beam.id),
  warpMeter: integer("warp_meter").notNull(),
  dateSent: text("date_sent").notNull(),
});

export const jobworkReceipt = pgTable("jobwork_receipt", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  partyId: integer("party_id")
    .notNull()
    .references(() => jobworkParty.id),
  qualityId: integer("quality_id")
    .notNull()
    .references(() => qualityMaster.id),
  billDate: text("bill_date").notNull(),
  meters: integer("meters").notNull(),
});

export const yarnPurchase = pgTable("yarn_purchase", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date"),
  dealer: text("dealer"),
  filamentDenier: text("filament_denier"),
  quantityKg: real("quantity_kg"),
  rate: real("rate"),
  amount: real("amount"),
});