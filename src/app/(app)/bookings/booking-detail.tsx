"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, Trash2, CalendarDays, Users } from "lucide-react";
import type { BookingStatus } from "@prisma/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, ActionButton, SubmitButton } from "@/components/form";
import { CheckboxField, Row, SelectField, TextField } from "@/components/fields";
import { DefinitionList } from "@/components/ui/misc";
import { BOOKING_STATUS } from "@/lib/labels";
import { fmtDate, fmtMoment } from "@/lib/dates";
import { whatsappLink } from "@/lib/utils";
import { confirmBooking, setBookingStatus, deleteBooking } from "@/server/bookings/actions";

type B = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  rawTime: string | null;
  message: string | null;
  status: BookingStatus;
  serviceName: string | null;
  durationMin: number | null;
  createdAt: string;
};

const DEFAULT_TIME: Record<string, string> = { morning: "10:00", afternoon: "14:00", evening: "18:00" };

export function BookingDetail({ booking: b, closeHref, linkedClient, clientIsLinked, linkedEvent }: { booking: B; closeHref: string; linkedClient: { id: string; name: string } | null; clientIsLinked: boolean; linkedEvent: { id: string; title: string; startsAt: string } | null }) {
  const router = useRouter();
  const [eventType, setEventType] = React.useState<"SHOOT" | "MEETING" | "NONE">(b.serviceName ? "SHOOT" : "MEETING");
  const close = () => router.replace(closeHref, { scroll: false });
  const greeting = `Hi ${b.name.split(" ")[0]}, thanks for your booking request${b.serviceName ? ` for ${b.serviceName}` : ""}.`;
  const wa = whatsappLink(b.phone, greeting);
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent wide title={b.company ? `${b.name} · ${b.company}` : b.name} description={`Received ${fmtMoment(new Date(b.createdAt))}`}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={BOOKING_STATUS[b.status].tone} dot>{BOOKING_STATUS[b.status].label}</Badge>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button asChild size="sm"><a href={`mailto:${b.email}?subject=${encodeURIComponent("Your booking request")}&body=${encodeURIComponent(greeting)}`}><Mail /> Email</a></Button>
              {wa && <Button asChild size="sm"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
              {b.phone && <Button asChild size="sm" variant="ghost"><a href={`tel:${b.phone}`}><Phone /> Call</a></Button>}
            </div>
          </div>

          <DefinitionList
            items={[
              { label: "Service", value: b.serviceName ?? "Not chosen" },
              { label: "Preferred", value: b.preferredDate ? `${fmtDate(b.preferredDate, "EEEE d MMM yyyy")}${b.preferredTime ? ` · ${b.preferredTime}` : ""}` : b.preferredTime ?? "No preference" },
              { label: "Email", value: b.email },
              { label: "Phone", value: b.phone ?? "—" },
            ]}
          />
          {b.message && <p className="whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed">{b.message}</p>}

          {(linkedClient || linkedEvent) && (
            <div className="flex flex-col gap-1.5 text-[13px]">
              {linkedClient && (
                <Link href={`/clients/${linkedClient.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Users className="size-4 text-subtle" /> {clientIsLinked ? "Client:" : "Matches existing client:"} {linkedClient.name}
                </Link>
              )}
              {linkedEvent && (
                <Link href="/calendar" className="inline-flex items-center gap-1.5 hover:underline">
                  <CalendarDays className="size-4 text-subtle" /> {linkedEvent.title} · {fmtMoment(new Date(linkedEvent.startsAt), "EEE d MMM, HH:mm")}
                </Link>
              )}
            </div>
          )}

          {b.status === "NEW" && (
            <ActionForm action={(fd) => confirmBooking(b.id, fd)} onSuccess={close} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <h3 className="text-[13px] font-semibold">Confirm booking</h3>
              {!linkedClient && <CheckboxField name="createClient" label="Create a lead client from this request" defaultChecked />}
              <SelectField
                name="eventType"
                label="Add to calendar"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as typeof eventType)}
                options={[
                  { value: "SHOOT", label: "As a shoot" },
                  { value: "MEETING", label: "As a meeting / call" },
                  { value: "NONE", label: "Don't add to calendar" },
                ]}
              />
              {eventType !== "NONE" && (
                <>
                  <Row cols={3}>
                    <TextField name="date" type="date" label="Date" defaultValue={b.preferredDate ?? ""} />
                    <TextField name="time" type="time" label="Time (Malta)" defaultValue={(b.rawTime && DEFAULT_TIME[b.rawTime]) || "10:00"} />
                    <TextField name="durationMin" type="number" label="Minutes" min={15} defaultValue={b.durationMin ?? 60} />
                  </Row>
                  <Row>
                    <TextField name="title" label="Event title" defaultValue={`${eventType === "SHOOT" ? "Shoot" : "Meeting"} — ${b.company || b.name}`} key={eventType} />
                    <TextField name="location" label="Location" placeholder="Optional" />
                  </Row>
                </>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-subtle">No message is sent. Reply using the buttons above.</p>
                <SubmitButton>Confirm booking</SubmitButton>
              </div>
            </ActionForm>
          )}

          <div className="-mx-5 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
            <ActionButton variant="danger-ghost" size="sm" action={() => deleteBooking(b.id)} confirm="Delete this request permanently? Use this for spam." onSuccess={close}>
              <Trash2 /> Delete
            </ActionButton>
            <div className="flex gap-2">
              {b.status === "NEW" && (
                <ActionButton size="sm" action={() => setBookingStatus(b.id, "DECLINED")} onSuccess={close}>Decline</ActionButton>
              )}
              {b.status === "CONFIRMED" && (
                <ActionButton size="sm" action={() => setBookingStatus(b.id, "CANCELLED")} confirm="Mark this booking as cancelled? Calendar events are kept — remove them in the calendar if needed.">Mark cancelled</ActionButton>
              )}
              {(b.status === "DECLINED" || b.status === "CANCELLED") && (
                <ActionButton size="sm" action={() => setBookingStatus(b.id, "NEW")}>Reopen</ActionButton>
              )}
              <Button size="sm" variant="ghost" onClick={close}>Close</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
