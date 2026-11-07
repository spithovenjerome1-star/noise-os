"use client";
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { Row, SelectField, TextAreaField, TextField } from "@/components/fields";
import { submitBookingRequest } from "@/server/bookings/public";

export function BookingForm({ services, defaultServiceId }: { services: { value: string; label: string }[]; defaultServiceId?: string }) {
  const [done, setDone] = React.useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date());
  if (done)
    return (
      <div className="flex flex-col items-center py-8 text-center animate-in">
        <CheckCircle2 className="mb-3 size-10 text-success" />
        <h3 className="text-lg font-semibold tracking-tight">Request received</h3>
        <p className="mt-1 max-w-sm text-[14px] text-muted">Thanks! We’ll check availability and get back to you shortly to confirm.</p>
      </div>
    );
  return (
    <ActionForm action={submitBookingRequest} onSuccess={() => setDone(true)} successMessage={false} refresh={false} className="flex flex-col gap-4">
      {services.length > 0 && <SelectField name="serviceId" label="Service" placeholder="Not sure yet" options={services} defaultValue={defaultServiceId ?? ""} key={defaultServiceId} />}
      <Row>
        <TextField name="name" label="Your name" autoComplete="name" required />
        <TextField name="company" label="Business (optional)" autoComplete="organization" />
      </Row>
      <Row>
        <TextField name="email" type="email" label="Email" autoComplete="email" required />
        <TextField name="phone" type="tel" label="Phone / WhatsApp" autoComplete="tel" />
      </Row>
      <Row>
        <TextField name="preferredDate" type="date" label="Preferred date" min={today} />
        <SelectField
          name="preferredTime"
          label="Preferred time"
          placeholder="Any time"
          options={[
            { value: "morning", label: "Morning" },
            { value: "afternoon", label: "Afternoon" },
            { value: "evening", label: "Evening" },
            { value: "flexible", label: "Flexible" },
          ]}
        />
      </Row>
      <TextAreaField name="message" label="What do you need?" placeholder="A few words about your business and the content you’re after." rows={4} />
      {/* Honeypot: hidden from people, irresistible to bots */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <SubmitButton size="lg" className="w-full">Send request</SubmitButton>
      <p className="text-center text-xs text-subtle">We only use your details to reply to this request.</p>
    </ActionForm>
  );
}
