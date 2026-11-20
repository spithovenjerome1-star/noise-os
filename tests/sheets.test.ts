import { describe, expect, it } from "vitest";
import {
  invoiceDigits,
  mapExpenseCategory,
  mapStatus,
  matchClient,
  parseAliases,
  parseBusinessAccount,
  parseContentList,
  parseCurrency,
  parseEditingLog,
  parseMonthLabel,
  parseSheetDate,
  parseVideoLog,
  spreadsheetIdFrom,
  type Tab,
} from "@/lib/domain/sheets";

// Made-up data in the same shape as the real sheets (dashboards on top, blank spacer rows,
// mixed date formats). No real client data belongs in this repository.

const octTab: Tab = {
  title: "October 2026",
  rows: [
    ["October 2026 Dashboard"],
    ["Total Invoiced", "Cash Received"],
    ["€900.00", "€300.00"],
    [],
    ["Invoice & Project Table"],
    ["Invoice Number", "Client Name", "Client Type", "Project Name", "Invoice Amount", "Invoice Date", "Due Date", "Amount Received", "Remaining Balance", "Payment Status", "Days Outstanding", "Payment Date", "Project Revenue", "Video Editing Cost", "Project Profit", "Profit Margin %", "Project Status", "Notes"],
    ["ABC-0007", "Acme Cars", "One off", "4 Reels", "€600.00", "2026-10-07", "", "", "€600.00", "Not Paid"],
    ["ABC-0008", "Blue Café", "Hospitality", "1 Reel", "€300.00", "46325", "", "€300.00", "€0.00", "Paid", "", "02/11/2026"],
    [],
    [],
    ["Monthly Business Expenses Table"],
    ["Expense Date", "Expense Name", "Category", "Cost", "Notes"],
    ["12/10/2026", "Fuel", "One-off", "€14.90"],
    [],
    ["19/10/2026", "GoDaddy", "Software", "€25.26"],
    ["19/10/2026", "GoDaddy", "Software", "€25.26"],
    ["16/10/2026", "Coverdrone", "Insurance", "€12.19", "Drone insurance"],
    [],
    [],
    [],
    [],
    [],
    ["Date", "Type", "Entity (Who)", "Description (What)", "Amount"],
    ["2026-10-20", "Loan", "Someone", "Not an expense", "500"],
    ["Owner Withdrawals (Paid to Myself)"],
    ["Date", "Description", "Amount"],
    ["2026-10-31", "Business to personal account", "530"],
  ],
};

const novTab: Tab = {
  title: "November 2026",
  rows: [
    ["November 2026 Dashboard"],
    [],
    ["Invoice & Project Table"],
    ["Invoice Number", "Client Name", "Client Type", "Project Name", "Invoice Amount", "Invoice Date", "Due Date", "Amount Received", "Remaining Balance", "Payment Status", "Days Outstanding", "Payment Date", "Project Revenue", "Video Editing Cost", "Project Profit", "Profit Margin %", "Project Status", "Notes"],
    ["7", "Acme Cars", "Automotive", "", "€600.00", "", "", "€600.00", "€0.00", "Paid", "", "09/11/2026", "", "", "", "", "", "Paid in full"],
    ["", "Malta Tech Institute", "Education", "", "€1,000.00", "", "", "€500.00", "", "", "", "12/11/2026", "", "", "", "", "", "50% deposit – number to confirm"],
    ["9", "Harbour Events", "Events", "", "€250.00", "", "", "0", "250", "Not Paid"],
    [],
    ["Monthly Business Expenses Table"],
    ["Expense Date", "Expense Name", "Category", "Cost", "Notes"],
    [],
    ["01/11/2026", "Google Workspace", "Monthly", "€13.60", "Monthly subscription"],
    ["12/11/2026"],
    ["2026-11-13", "Camera lenses (x2)", "Equipment", "1200", "One-off"],
    ["2026-11-14", "Facebook Ads – Acme Cars", "Marketing", "106", ""],
    [],
    ["Owner Withdrawals (Paid to Myself)"],
    ["Date", "Description", "Amount"],
    ["01/11/2026", "Business to personal account", "€100.00"],
  ],
};

const editingCostsTab: Tab = {
  title: "Editing Costs",
  rows: [
    ["Editing Costs 2026"],
    ["Total Editing Costs", "€300.00"],
    ["All editing is non-deductible."],
    ["Date Paid", "For Month", "Description", "Note", "Amount"],
    ["October 2026", "September 2026", "Editor payment for September work", "Non-deductible", "€200.00"],
    ["October 2026", "October 2026", "Editor payment", "", "€100.00"],
  ],
};

const summaryTab: Tab = { title: "2026 Summary", rows: [["Invoice Number", "Client Name", "Invoice Amount"], ["X-1", "Nobody", "€1.00"]] };

describe("cell parsing", () => {
  it("reads every date format used in the sheets", () => {
    expect(parseSheetDate("31/10/2026")).toBe("2026-10-31");
    expect(parseSheetDate("2026-10-31")).toBe("2026-10-31");
    expect(parseSheetDate("46196")).toBe("2026-06-23");
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("soon")).toBeNull();
    expect(parseMonthLabel("July 2026")).toBe("2026-07-01");
    expect(parseMonthLabel("Sept 2026")).toBe("2026-09-01");
  });

  it("normalises invoice numbers to their digits", () => {
    expect(invoiceDigits("ABC-0019")).toBe(19);
    expect(invoiceDigits("19")).toBe(19);
    expect(invoiceDigits("draft")).toBeNull();
  });

  it("maps sheet statuses to pipeline categories", () => {
    expect(mapStatus("Posted")).toEqual({ category: "DELIVERED", known: true });
    expect(mapStatus("Ready to post")).toEqual({ category: "APPROVED", known: true });
    expect(mapStatus("In Progress")).toEqual({ category: "EDITING", known: true });
    expect(mapStatus("Not started")).toEqual({ category: "PLANNED", known: true });
    expect(mapStatus("Confirmed")).toEqual({ category: "APPROVED", known: true });
    expect(mapStatus("Lost in space")).toEqual({ category: "PLANNED", known: false });
  });

  it("maps expense names and sheet categories to app categories", () => {
    expect(mapExpenseCategory("Monthly", "Adobe")).toBe("SOFTWARE");
    expect(mapExpenseCategory("Equipment", "Camera lenses (x2)")).toBe("LENSES_ACCESSORIES");
    expect(mapExpenseCategory("Insurance", "Coverdrone")).toBe("OTHER");
    expect(mapExpenseCategory("Marketing", "Facebook Ads – Acme")).toBe("MARKETING");
    expect(mapExpenseCategory("Monthly", "Revolut Metal Plan")).toBe("OTHER");
    expect(mapExpenseCategory("Transport", "Gozo Channel ferry")).toBe("TRAVEL");
    expect(mapExpenseCategory("One-off", "Fuel")).toBe("TRANSPORT");
  });

  it("extracts the spreadsheet id from a link", () => {
    expect(spreadsheetIdFrom("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(spreadsheetIdFrom("1AbCdEfGhIjKlMnOpQrStUvWxYz012345")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(spreadsheetIdFrom("not a link")).toBeNull();
  });

  it("reads currencies", () => {
    expect(parseCurrency("EUR (€)")).toBeNull();
    expect(parseCurrency("USD ($)")).toBe("USD");
    expect(parseCurrency("")).toBeNull();
  });
});

describe("business account sheet", () => {
  const r = parseBusinessAccount([summaryTab, octTab, novTab, editingCostsTab]);

  it("ignores calculated tabs and reads only month tabs + Editing Costs", () => {
    expect(r.invoices.map((i) => i.number)).not.toContain("X-1");
    expect(r.parsedScopes).toEqual(["inv|October 2026", "exp|October 2026", "inv|November 2026", "exp|November 2026", "exp|Editing Costs"]);
  });

  it("merges an invoice listed again (as a bare number) in the month it was paid", () => {
    const inv = r.invoices.find((i) => i.key === "inv|#7")!;
    expect(inv.number).toBe("ABC-0007");
    expect(inv.amountCents).toBe(60000);
    expect(inv.issueDate).toBe("2026-10-07");
    expect(inv.receivedCents).toBe(60000);
    expect(inv.paymentDate).toBe("2026-11-09");
    expect(inv.seenIn.map((s) => s.tab)).toEqual(["October 2026", "November 2026"]);
    expect(r.issues.some((i) => i.level === "info" && i.message.includes("ABC-0007"))).toBe(true);
  });

  it("reads Sheets serial dates and payments", () => {
    const inv = r.invoices.find((i) => i.number === "ABC-0008")!;
    expect(inv.issueDate).toBe("2026-10-30");
    expect(inv.receivedCents).toBe(30000);
    expect(inv.paymentDate).toBe("2026-11-02");
    expect(inv.clientType).toBe("Hospitality");
  });

  it("skips invoices without a number instead of inventing one", () => {
    expect(r.invoices.some((i) => i.clientName === "Malta Tech Institute")).toBe(false);
    expect(r.issues.some((i) => i.level === "warn" && i.message.includes("Malta Tech Institute") && i.message.includes("no invoice number"))).toBe(true);
    expect(r.invoices.find((i) => i.number === "9")?.receivedCents).toBe(0);
  });

  it("reads expense tables up to the next section, never owner withdrawals or other tables", () => {
    const oct = r.expenses.filter((e) => e.tab === "October 2026");
    expect(oct.map((e) => e.description)).toEqual(["Fuel", "GoDaddy", "GoDaddy", "Coverdrone"]);
    expect(r.expenses.some((e) => /personal account|Not an expense/.test(e.description))).toBe(false);
  });

  it("keeps identical expense rows apart with stable keys", () => {
    const keys = r.expenses.filter((e) => e.description === "GoDaddy").map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys[1]).toMatch(/#2$/);
    // Same input → same keys (the sync relies on this to update instead of duplicate).
    expect(parseBusinessAccount([octTab]).expenses.map((e) => e.key)).toEqual(r.expenses.filter((e) => e.tab === "October 2026").map((e) => e.key));
  });

  it("warns about incomplete expense rows", () => {
    expect(r.expenses.filter((e) => e.tab === "November 2026").map((e) => e.description)).toEqual(["Google Workspace", "Camera lenses (x2)", "Facebook Ads – Acme Cars"]);
    expect(r.issues.some((i) => i.level === "warn" && i.row === 13 && i.message.includes("no expense name"))).toBe(true);
  });

  it("turns Editing Costs into editor expenses dated by month", () => {
    const ed = r.expenses.filter((e) => e.tab === "Editing Costs");
    expect(ed).toHaveLength(2);
    expect(ed[0]).toMatchObject({ date: "2026-10-01", category: "FREELANCE_EDITORS", amountCents: 20000, description: "Editor payment for September work" });
    expect(ed[1]!.description).toBe("Editor payment (October 2026)");
  });

  it("warns when one invoice number is used for two clients", () => {
    const clash = parseBusinessAccount([
      { title: "May 2026", rows: [["Invoice Number", "Client Name", "Invoice Amount"], ["5", "Acme Cars", "100"]] },
      { title: "June 2026", rows: [["Invoice Number", "Client Name", "Invoice Amount"], ["ABC-0005", "Blue Café", "200"]] },
    ]);
    expect(clash.invoices).toHaveLength(1);
    expect(clash.invoices[0]!.clientName).toBe("Blue Café");
    expect(clash.issues.some((i) => i.level === "warn" && i.message.includes("different clients"))).toBe(true);
  });
});

describe("client video logbook", () => {
  const tabs: Tab[] = [
    {
      title: "October 26",
      rows: [[], ["", "Content Tracker"], [], ["", "Date", "Format", "Content Topic", "Type", "Status"], ["", "2026-10-01", "Video", "", "Organic", "Not started"]],
    },
    {
      title: "Video Logbook",
      rows: [
        [],
        ["", "Acme Cars • Video Production Logbook"],
        [],
        ["", "", "POSTED", "READY TO POST", "IN PROGRESS"],
        ["", "3", "2", "1", "0"],
        [],
        ["", "Video #", "Video Description", "Status", "Notes / Link"],
        ["", "VID-001", "BMW X1", "Posted"],
        ["", "VID-002", "Nissan Micra ", "Ready to post", "https://example.com/review"],
        ["", "VID-003", "Promo", "Wobbly"],
        ["", "VID-004"],
        ["", "VID-005"],
      ],
    },
  ];
  const r = parseVideoLog(tabs);

  it("reads only tabs with a Video # header and skips numbered placeholder rows", () => {
    expect(r.parsedScopes).toEqual(["vid|Video Logbook"]);
    expect(r.videos.map((v) => v.key)).toEqual(["vid|VID-001", "vid|VID-002", "vid|VID-003"]);
  });

  it("maps statuses and links", () => {
    expect(r.videos[0]).toMatchObject({ title: "VID-001 · BMW X1", category: "DELIVERED" });
    expect(r.videos[1]).toMatchObject({ title: "VID-002 · Nissan Micra", category: "APPROVED", link: "https://example.com/review" });
    expect(r.videos[2]!.category).toBe("PLANNED");
    expect(r.issues.some((i) => i.message.includes("Wobbly"))).toBe(true);
  });
});

describe("client content list", () => {
  const r = parseContentList([
    {
      title: "October 2026",
      rows: [
        ["Video", "Alumni Video", "Confirmed"],
        ["Video", "Gaming", "In progress"],
        ["Post", "Open Day", "Not started"],
        ["Post", "", "Not started"],
        ["Post", "", "Not started"],
      ],
    },
  ]);

  it("reads Type · Title · Status rows without a header and skips empty placeholders", () => {
    expect(r.videos.map((v) => [v.title, v.category])).toEqual([
      ["Alumni Video", "APPROVED"],
      ["Gaming", "EDITING"],
      ["Open Day (Post)", "PLANNED"],
    ]);
    expect(new Set(r.videos.map((v) => v.key)).size).toBe(3);
  });
});

describe("editing logbook", () => {
  it("reads editor jobs with currency, skipping rows without an editor", () => {
    const r = parseEditingLog([
      {
        title: "November 2026",
        rows: [
          ["Video", "Editor", "Price", "Status", "Currency"],
          ["BMW X1 ", "Sam", "23.00", "Confirmed", "EUR (€)"],
          ["Peugeot 308", "Kim", "10.00", "Confirmed", "USD ($)"],
          ["Mazda CX3", "", "", "Confirmed"],
        ],
      },
    ]);
    expect(r.jobs).toEqual([
      { title: "BMW X1", editor: "Sam", amountCents: 2300, currency: null, statusText: "Confirmed", tab: "November 2026", row: 2 },
      { title: "Peugeot 308", editor: "Kim", amountCents: 1000, currency: "USD", statusText: "Confirmed", tab: "November 2026", row: 3 },
    ]);
  });
});

describe("client matching", () => {
  const clients = [
    { id: "1", name: "Malta Tech Institute", companyName: null },
    { id: "2", name: "Acme Cars", companyName: "Acme Cars Ltd" },
    { id: "3", name: "Harbour Events", companyName: null },
  ];
  it("matches by alias, name, company name and acronym", () => {
    expect(matchClient("acme cars", clients, new Map())?.id).toBe("2");
    expect(matchClient("Acme Cars Ltd", clients, new Map())?.id).toBe("2");
    expect(matchClient("MTI", clients, new Map())?.id).toBe("1");
    expect(matchClient("Harbour", clients, parseAliases("Harbour = Harbour Events"))?.id).toBe("3");
    expect(matchClient("Nobody", clients, new Map())).toBeNull();
  });
  it("matches a long sheet name to an acronym client", () => {
    expect(matchClient("Malta Tech Institute", [{ id: "9", name: "MTI", companyName: null }], new Map())?.id).toBe("9");
  });
});

describe("layout safety", () => {
  it("never reads an owner-withdrawals table as expenses when the expense header is renamed", () => {
    const renamed = { ...octTab, rows: octTab.rows.map((r) => (r[0] === "Expense Date" ? ["When", "What", "Kind", "Price"] : r)) };
    const r = parseBusinessAccount([renamed]);
    expect(r.expenses).toHaveLength(0);
    expect(r.parsedScopes).toEqual(["inv|October 2026"]);
  });
});
