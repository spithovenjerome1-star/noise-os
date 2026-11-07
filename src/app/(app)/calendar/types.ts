export type Segment = { date: string; startMin: number; endMin: number };

export type EventPayload = {
  id: string;
  title: string;
  type: "SHOOT" | "MEETING" | "MILESTONE" | "DELIVERY" | "OTHER";
  allDay: boolean;
  startsLocal: string;
  endsLocal: string;
  startDate: string;
  endDate: string;
  location: string;
  clientId: string;
  projectId: string;
  videoId: string;
  notes: string;
  equipmentIds: string[];
};

export type CalItem = {
  key: string;
  kind: "event" | "deadline" | "invoice";
  typeKey: "SHOOT" | "MEETING" | "MILESTONE" | "DELIVERY" | "OTHER" | "EDIT_DEADLINE" | "INVOICE_DUE";
  title: string;
  subtitle?: string;
  allDay: boolean;
  segments: Segment[];
  timeLabel?: string;
  href?: string;
  event?: EventPayload;
};

export type Opt = { value: string; label: string; clientId?: string };
export type CalOptions = { clients: Opt[]; projects: Opt[]; videos: Opt[]; equipment: Opt[] };
