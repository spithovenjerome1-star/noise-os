import "server-only";
import { db } from "@/lib/db";
import { getSettings, getVatRates } from "../settings";
import { clientOptions } from "../lookups";
import { formatInvoiceNumber } from "@/lib/domain/invoices";
import { todayMalta } from "@/lib/dates";

export async function invoiceEditorData() {
  const [settings, vatRates, clients] = await Promise.all([getSettings(), getVatRates(), clientOptions()]);
  // Skip numbers already used (e.g. imported invoices)
  let n = settings.nextInvoiceNumber;
  for (let i = 0; i < 50; i++) {
    const num = formatInvoiceNumber(settings.invoicePrefix, n, settings.invoicePadding);
    if (!(await db.invoice.findUnique({ where: { number: num }, select: { id: true } }))) break;
    n++;
  }
  return {
    clients,
    vatRates: vatRates.map((r) => ({ id: r.id, name: r.name, rateBp: r.rateBp, isDefault: r.isDefault, note: r.note })),
    defaults: { issueDate: todayMalta(), paymentTerms: settings.defaultPaymentTerms, nextNumber: formatInvoiceNumber(settings.invoicePrefix, n, settings.invoicePadding) },
  };
}
