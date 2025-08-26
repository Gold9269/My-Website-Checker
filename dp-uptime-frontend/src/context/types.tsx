// src/context/types.ts
export type WebsiteStatus = "Good" | "Bad";

export interface IWebsite {
  _id: string;
  url: string;
  userId: string;
  ownerEmail?: string | null;
  ticks: string[]; // ObjectId[] as strings
  disabled: boolean;
  lastAlertAt?: string | null;
  alertCooldownMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
}n

export interface IWebsiteTick {
  _id: string;
  websiteId: string;
  validatorId: string;
  createdAt: string;
  status: WebsiteStatus;
  latency: number;
}

export interface IValidator {
  _id: string;
  publicKey: string;
  location: string;
  ip: string;
  pendingPayouts: number; // stored in lamports on backend
  ticks: string[]; // ObjectId[]
  createdAt?: string;
  updatedAt?: string;
}
