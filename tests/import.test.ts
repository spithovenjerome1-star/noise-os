import { describe, expect, it } from "vitest";
import { autoMap, detectDuplicates, parseEnum, parseImportDate, parseRow, IMPORT_FIELDS } from "@/lib/domain/import";

describe("autoMap", () => {
  it("maps common Google Sheets headers for clients", () => {
    const m = autoMap("clients", ["Client", "E-mail", "Phone Number", "Instagram", "Monthly Retainer", "Start Date", "Random column"]);
    expect(m.name).toBe("Client");
    expect(m.email).toBe("E-mail");
    expect(m.phone).toBe("Phone Number");
    expect(m.instagram).toBe("Instagram");
    expect(m.valueCents).toBe("Monthly Retainer");
    expect(m.startedAt).toBe("Start Date");
    expect(Object.values(m)).not.toContain("Random column");
  });
  it("never maps one header to two fields", () => {
    const m = autoMap("invoices", ["Invoice No", "Client", "Date", "Total"]);
    const used = Object.values(m).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
    expect(m.number).toBe("Invoice No");
    expect(m.issueDate).toBe("Date");
    expect(m.total).toBe("Total");
  });
  it("returns null for every unmapped field", () => {
    const m = autoMap("tasks", ["Something"]);
    expect(Object.keys(m).sort()).toEqual(IMPORT_FIELDS.tasks.map((f) => f.key).sort());
    expect(Object.values(m).every((v) => v === null)).toBe(true);
  });
});

describe("parseImportDate", () => {
  it("accepts ISO and day-first formats", () => {
    expect(parseImportDate("2026-03-05")).toBe("2026-03-05");
    expect(parseImportDate("5/3/2026")).toBe("2026-03-05");
    expect(parseImportDate("05.03.26")).toBe("2026-03-05");
    expect(parseImportDate("2026-03-05T10:00:00Z")).toBe("2026-03-05");
  });
  it("rejects impossible dates and garbage", () => {
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportDate("13/13/2026")).toBeNull();
    expect(parseImportDate("next week")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("parseEnum", () => {
  it("understands friendly spellings", () => {
    const f = IMPORT_FIELDS.expenses.find((x) => x.key === "category")!;
    expect(parseEnum("Software Subscriptions", f.enumValues!)).toBe("SOFTWARE");
    expect(parseEnum("fuel", f.enumValues!)).toBe("VEHICLE");
    expect(parseEnum("SOFTWARE", f.enumValues!)).toBe("SOFTWARE");
    expect(parseEnum("unicorns", f.enumValues!)).toBeNull();
  });
});

describe("parseRow", () => {
  const mapping = { date: "Date", description: "Item", amount: "Amount", vat: "VAT", category: "Cat", businessUsePct: "Biz" };
  it("coerces money, dates and percentages", () => {
    const r = parseRow("expenses", { Date: "01/11/2026", Item: "Adobe CC", Amount: "€59.99", VAT: "9,15", Cat: "software", Biz: "80%" }, mapping);
    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({ date: "2026-11-01", description: "Adobe CC", amount: 5999, vat: 915, category: "SOFTWARE", businessUsePct: 8000 });
  });
  it("reports missing required values instead of inventing them", () => {
    const r = parseRow("expenses", { Date: "", Item: "Taxi", Amount: "" }, mapping);
    expect(r.errors).toContain("Date is missing");
    expect(r.errors).toContain("Amount (gross) is missing");
    expect(r.values.date).toBeNull();
  });
  it("reports invalid values", () => {
    const r = parseRow("clients", { Name: "MS Motors", Email: "not-an-email" }, { name: "Name", email: "Email" });
    expect(r.errors).toEqual(['Email "not-an-email" is not a valid email']);
  });
  it("requires an amount on invoices", () => {
    const r = parseRow("invoices", { N: "NOISE-0001", C: "Bistro", D: "2026-10-01" }, { number: "N", client: "C", issueDate: "D" });
    expect(r.errors).toContain("Provide a net amount or a total");
  });
});

describe("detectDuplicates", () => {
  it("flags rows matching existing records and repeats within the file", () => {
    const rows = [
      { values: { name: "MS Motors", email: null }, errors: [] },
      { values: { name: "Bistro Boca", email: "hi@boca.mt" }, errors: [] },
      { values: { name: "bistro boca", email: null }, errors: [] },
      { values: { name: "New Client", email: "info@ms.mt" }, errors: [] },
    ];
    const existing = new Set(["name:ms motors", "email:info@ms.mt"]);
    expect(detectDuplicates("clients", rows, existing)).toEqual([
      { existing: true, inFile: false },
      { existing: false, inFile: false },
      { existing: false, inFile: true },
      { existing: true, inFile: false },
    ]);
  });
  it("matches invoices by number", () => {
    const rows = [{ values: { number: "NOISE-0007" }, errors: [] }];
    expect(detectDuplicates("invoices", rows, new Set(["number:noise-0007"]))[0]!.existing).toBe(true);
  });
});
